import "server-only";
import Decimal from "decimal.js";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { notify } from "@/features/notifications/service";
import { D, money, qty as q3 } from "@/shared/core/money";
import {
  supplierSchema, purchaseOrderSchema, receiveSchema, payPurchaseSchema,
  purchaseReturnSchema,
  type ReceiveInput,
} from "./schema";
import type { Prisma, PurchaseOrderStatus } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Numbering (PO- / PUR- / PRE- + 6 digits)
// ---------------------------------------------------------------------------

async function nextNumber(
  tx: Prisma.TransactionClient,
  kind: "po" | "purchase" | "purchaseReturn",
): Promise<string> {
  const prefix = kind === "po" ? "PO-" : kind === "purchase" ? "PUR-" : "PRE-";
  const where = kind === "po"
    ? { poNumber: { startsWith: prefix } }
    : kind === "purchase"
      ? { purchaseNumber: { startsWith: prefix } }
      : { returnNumber: { startsWith: prefix } };
  const last =
    kind === "po"
      ? await tx.purchaseOrder.findFirst({ where, orderBy: { poNumber: "desc" }, select: { poNumber: true } })
      : kind === "purchase"
        ? await tx.purchase.findFirst({ where, orderBy: { purchaseNumber: "desc" }, select: { purchaseNumber: true } })
        : await tx.purchaseReturn.findFirst({ where, orderBy: { returnNumber: "desc" }, select: { returnNumber: true } });
  const raw = last ? Object.values(last)[0] as string : null;
  const n = raw ? Number.parseInt(raw.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function listSuppliers(opts: { q?: string; includeInactive?: boolean; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const q = opts.q?.trim();
  const where: Prisma.SupplierWhereInput = {
    deletedAt: null,
    ...(!opts.includeInactive ? { isActive: true } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nameAr: { contains: q } },
            { code: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.supplier.count({ where }),
  ]);
  return { rows, total: count, page, pageSize };
}

export async function getSupplierForEdit(id: string) {
  const s = await db.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!s) throw new AppError("NOT_FOUND", "Supplier not found");
  return s;
}

export async function saveSupplier(id: string | null, raw: unknown) {
  const data = supplierSchema.parse(raw);
  if (id) {
    const existing = await db.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new AppError("NOT_FOUND", "Supplier not found");
    return db.supplier.update({
      where: { id },
      data: {
        name: data.name,
        nameAr: data.nameAr || null,
        company: data.company || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        creditLimit: money(data.creditLimit).toString(),
        paymentTerms: data.paymentTerms || null,
        notes: data.notes || null,
      },
    });
  }
  const seq = await db.supplier.count();
  return db.supplier.create({
    data: {
      code: `SUP-${String(seq + 1).padStart(3, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`,
      name: data.name,
      nameAr: data.nameAr || null,
      company: data.company || null,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      creditLimit: money(data.creditLimit).toString(),
      paymentTerms: data.paymentTerms || null,
      notes: data.notes || null,
    },
  });
}

export async function softDeleteSupplier(id: string) {
  const [purchases, pos] = await Promise.all([
    db.purchase.count({ where: { supplierId: id } }),
    db.purchaseOrder.count({ where: { supplierId: id } }),
  ]);
  if (purchases > 0 || pos > 0) throw new AppError("IN_USE", "Supplier has procurement history");
  const s = await db.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!s) throw new AppError("NOT_FOUND", "Supplier not found");
  await db.supplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
}

// ---------------------------------------------------------------------------
// Product search for builders (PO / receiving).
// ---------------------------------------------------------------------------

export async function searchProductsForProcurement(q: string) {
  const term = q.trim();
  return db.product.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(term
        ? {
            OR: [
              { barcode: term },
              { sku: { contains: term, mode: "insensitive" } },
              { name: { contains: term, mode: "insensitive" } },
              { nameAr: { contains: term } },
            ],
          }
        : {}),
    },
    select: {
      id: true, sku: true, name: true, nameAr: true,
      costPrice: true, trackBatches: true, trackExpiry: true,
      unit: { select: { symbol: true } },
    },
    orderBy: [{ name: "asc" }],
    take: 20,
  });
}

// ---------------------------------------------------------------------------
// Purchase orders â€” status machine:
// DRAFT â†’ PENDING â†’ APPROVED â†’ ORDERED â†’ PARTIALLY_RECEIVED â†’ RECEIVED
// CANCELLED allowed until receiving starts.
// ---------------------------------------------------------------------------

const PO_ACTIVE_STATUSES: PurchaseOrderStatus[] = ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"];

export async function listPurchaseOrders(opts: {
  q?: string; status?: PurchaseOrderStatus; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const q = opts.q?.trim();
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(q
      ? {
          OR: [
            { poNumber: { contains: q, mode: "insensitive" } },
            { supplier: { name: { contains: q, mode: "insensitive" } } },
            { supplier: { nameAr: { contains: q } } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { code: true, name: true, nameAr: true } } },
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchaseOrder.count({ where }),
  ]);
  return { rows, total: count, page, pageSize };
}

export async function getPoDetail(id: string) {
  const po = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, code: true, name: true, nameAr: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: {
            select: { sku: true, name: true, nameAr: true, unit: { select: { symbol: true } } },
          },
        },
      },
      purchases: { select: { id: true, purchaseNumber: true, date: true, total: true } },
    },
  });
  if (!po) throw new AppError("NOT_FOUND", "Purchase order not found");
  return po;
}

export async function createPurchaseOrder(userId: string, raw: unknown) {
  const input = purchaseOrderSchema.parse(raw);

  // Resolve products once for names + validation.
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await db.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, isActive: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  const computed = input.items.map((item) => {
    const p = byId.get(item.productId);
    if (!p || !p.isActive) throw new AppError("VALIDATION_ERROR", "Invalid or inactive product in PO");
    const gross = D(item.unitCost).mul(item.quantity);
    const disc = money(item.discount ?? 0);
    const net = gross.minus(disc);
    subtotal = subtotal.plus(gross);
    discountTotal = discountTotal.plus(disc);
    return {
      productId: item.productId,
      quantity: q3(item.quantity),
      unitCost: money(item.unitCost),
      discount: disc,
      lineTotal: net,
    };
  });

  const po = await db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null, isActive: true } });
    if (!supplier) throw new AppError("NOT_FOUND", "Supplier not found");
    const created = await tx.purchaseOrder.create({
      data: {
        poNumber: await nextNumber(tx, "po"),
        supplierId: input.supplierId,
        userId,
        expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
        status: "PENDING",
        subtotal: subtotal.toString(),
        discountTotal: discountTotal.toString(),
        total: subtotal.minus(discountTotal).toString(),
        notes: input.notes || null,
        items: {
          create: computed.map((c) => ({
            productId: c.productId,
            quantity: c.quantity.toString(),
            unitCost: c.unitCost.toString(),
            discount: c.discount.toString(),
            lineTotal: c.lineTotal.toString(),
          })),
        },
      },
    });
    return created;
  });

  await import("@/shared/core/audit").then(({ recordAudit }) =>
    recordAudit(db, { userId, action: "PURCHASE_ORDER_CREATE", entityType: "PurchaseOrder", entityId: po.id }),
  );
  void notify({
    type: "PURCHASE_ORDER", title: "PURCHASE_ORDER",
    body: `${po.poNumber} · PENDING`,
    entityType: "PurchaseOrder", entityId: po.id, href: "/procurement/purchase-orders",
  });
  return po;
}

export async function transitionPo(userId: string, poId: string, action: "submit" | "approve" | "order" | "cancel") {
  const po = await db.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!existing) throw new AppError("NOT_FOUND", "Purchase order not found");
    const from = existing.status;
    let to: PurchaseOrderStatus;
    switch (action) {
      case "submit":
        if (from !== "DRAFT") throw new AppError("INVALID_STATE", `Cannot submit from ${from}`);
        to = "PENDING";
        break;
      case "approve":
        if (from !== "PENDING") throw new AppError("INVALID_STATE", `Cannot approve from ${from}`);
        to = "APPROVED";
        break;
      case "order":
        if (from !== "APPROVED") throw new AppError("INVALID_STATE", `Cannot order from ${from}`);
        to = "ORDERED";
        break;
      case "cancel": {
        if (!["DRAFT", "PENDING", "APPROVED", "ORDERED"].includes(from)) {
          throw new AppError("INVALID_STATE", `Cannot cancel from ${from}`);
        }
        to = "CANCELLED";
        break;
      }
    }
    return tx.purchaseOrder.update({ where: { id: poId }, data: { status: to } });
  });
  await import("@/shared/core/audit").then(({ recordAudit }) =>
    recordAudit(db, { userId, action: `PURCHASE_ORDER_${action.toUpperCase()}`, entityType: "PurchaseOrder", entityId: poId }),
  );
  void notify({
    type: "PURCHASE_ORDER", title: "PURCHASE_ORDER",
    body: `${po.poNumber} · ${po.status}`,
    entityType: "PurchaseOrder", entityId: poId, href: "/procurement/purchase-orders",
  });
  return po;
}

// ---------------------------------------------------------------------------
// F4 â€” Receiving (GRN). Serializable txn:
//   validate â†’ PO receivedQty/status updates â†’ batch creation â†’ PURCHASE
//   movements â†’ inventory increment â†’ supplier balance += due.
// ---------------------------------------------------------------------------

export async function receivePurchase(userId: string, raw: unknown) {
  const input: ReceiveInput = receiveSchema.parse(raw);
  if (input.purchaseOrderId && !input.items.some(() => true)) {
    throw new AppError("VALIDATION_ERROR", "No items");
  }

  const result = await db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) throw new AppError("NOT_FOUND", "Supplier not found");

    let po: { id: string; poNumber: string; status: PurchaseOrderStatus } | null = null;
    if (input.purchaseOrderId) {
      const found = await tx.purchaseOrder.findUnique({
        where: { id: input.purchaseOrderId },
        include: { items: true },
      });
      if (!found) throw new AppError("NOT_FOUND", "Purchase order not found");
      if (!PO_ACTIVE_STATUSES.includes(found.status)) {
        throw new AppError("INVALID_STATE", `PO ${found.poNumber} is ${found.status} â€” cannot receive`);
      }
      if (found.supplierId !== input.supplierId) {
        throw new AppError("VALIDATION_ERROR", "PO belongs to a different supplier");
      }
      po = { id: found.id, poNumber: found.poNumber, status: found.status };
    }

    // Validate products + compute totals.
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, sku: true, isActive: true, trackBatches: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = new Decimal(0);
    let discountTotal = new Decimal(0);
    const lines = input.items.map((item) => {
      const p = byId.get(item.productId);
      if (!p || !p.isActive) throw new AppError("VALIDATION_ERROR", `Invalid product ${item.productId}`);
      const gross = D(item.unitCost).mul(item.quantity);
      const disc = money(item.discount ?? 0);
      const net = gross.minus(disc);
      subtotal = subtotal.plus(gross);
      discountTotal = discountTotal.plus(disc);
      return {
        productId: item.productId,
        sku: p.sku,
        trackBatches: p.trackBatches,
        quantity: q3(item.quantity),
        unitCost: money(item.unitCost),
        discount: disc,
        lineNet: net,
        lineTotal: net,
        batchNo: item.batchNo || null,
        mfgDate: item.mfgDate ? new Date(item.mfgDate) : null,
        expDate: item.expDate ? new Date(item.expDate) : null,
      };
    });

    const total = subtotal.minus(discountTotal);
    const paid = money(input.paidAmount);
    if (paid.gt(total)) throw new AppError("VALIDATION_ERROR", "Paid amount exceeds total");
    const due = total.minus(paid);

    const settings = await tx.systemSettings.findUnique({ where: { id: "system" } });

    // PO over-receipt guard + receivedQty updates.
    if (po) {
      const poFull = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: po.id },
        include: { items: true },
      });
      for (const line of lines) {
        const poItem = poFull.items.find((i) => i.productId === line.productId);
        if (!poItem) {
          throw new AppError("VALIDATION_ERROR", `Product ${line.sku} is not on PO ${po.poNumber}`);
        }
        const open = D(poItem.quantity).minus(poItem.receivedQty);
        if (line.quantity.gt(open)) {
          throw new AppError(
            "OVER_RECEIPT",
            `${line.sku}: ordered ${poItem.quantity}, open ${open}, tried ${line.quantity}`,
          );
        }
      }
      for (const line of lines) {
        await tx.purchaseOrderItem.update({
          where: { id: poFull.items.find((i) => i.productId === line.productId)!.id },
          data: { receivedQty: { increment: line.quantity.toString() } },
        });
      }
    }

    // Create the purchase + items.
    const purchase = await tx.purchase.create({
      data: {
        purchaseNumber: await nextNumber(tx, "purchase"),
        supplierId: input.supplierId,
        purchaseOrderId: po?.id ?? null,
        userId,
        subtotal: subtotal.toString(),
        discountTotal: discountTotal.toString(),
        total: total.toString(),
        paidAmount: paid.toString(),
        dueAmount: due.toString(),
        notes: input.notes || null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            batchNo: l.batchNo,
            mfgDate: l.mfgDate,
            expDate: l.expDate,
            quantity: l.quantity.toString(),
            unitCost: l.unitCost.toString(),
            discount: l.discount.toString(),
            lineTotal: l.lineTotal.toString(),
          })),
        },
      },
      include: { items: { orderBy: { id: "asc" } } },
    });

    // Batches + movements + inventory increment per line.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const item = purchase.items[i]!;
      let batchId: string | null = null;
      const wantsBatch = line.trackBatches && (settings?.batchTrackingEnabled ?? true);
      if (wantsBatch && (line.batchNo || line.expDate)) {
        const batch = await tx.productBatch.create({
          data: {
            productId: line.productId,
            supplierId: input.supplierId,
            batchNo: line.batchNo ?? `B-${purchase.purchaseNumber}-${i + 1}`,
            mfgDate: line.mfgDate,
            expiryDate: line.expDate,
            quantity: line.quantity.toString(),
            costPrice: line.unitCost.toString(),
          },
        });
        batchId = batch.id;
      }
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          batchId,
          type: "PURCHASE",
          quantity: line.quantity.toString(), // positive = in
          unitCost: line.unitCost.toString(),
          refType: "Purchase",
          refId: item.id,
          userId,
        },
      });
      await tx.inventory.upsert({
        where: { productId: line.productId },
        create: { productId: line.productId, quantity: line.quantity.toString() },
        update: { quantity: { increment: line.quantity.toString() } },
      });
    }

    // Supplier owes us the unpaid part (we owe supplier money â†’ balance up).
    if (due.gt(0)) {
      await tx.supplier.update({
        where: { id: input.supplierId },
        data: { balance: { increment: due.toString() } },
      });
    }

    // PO status roll-up.
    if (po) {
      const poFull = await tx.purchaseOrder.findUniqueOrThrow({
        where: { id: po.id },
        include: { items: { select: { quantity: true, receivedQty: true } } },
      });
      const fullyReceived = poFull.items.every((i) => D(i.receivedQty).gte(i.quantity));
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" },
      });
    }

    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, { userId, action: "PURCHASE_CREATE", entityType: "Purchase", entityId: purchase.id }),
    );

    return {
      purchaseId: purchase.id,
      purchaseNumber: purchase.purchaseNumber,
      total: total.toNumber(),
      paid: paid.toNumber(),
      due: due.toNumber(),
    };
  });
  void notify({
    type: "GOODS_RECEIVED", title: "GOODS_RECEIVED",
    body: `${result.purchaseNumber} · ${result.total}`,
    entityType: "Purchase", entityId: result.purchaseId, href: "/procurement/receiving",
  });
  return result;
}

// ---------------------------------------------------------------------------
// Paying down a purchase's dues.
// ---------------------------------------------------------------------------

export async function payPurchase(userId: string, raw: unknown) {
  const input = payPurchaseSchema.parse(raw);
  const result = await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({ where: { id: input.purchaseId } });
    if (!purchase) throw new AppError("NOT_FOUND", "Purchase not found");
    if (D(input.amount).gt(purchase.dueAmount)) {
      throw new AppError("VALIDATION_ERROR", `Due is ${purchase.dueAmount}`);
    }
    const updated = await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        paidAmount: { increment: input.amount.toString() },
        dueAmount: { decrement: input.amount.toString() },
      },
    });
    await tx.supplier.update({
      where: { id: purchase.supplierId },
      data: { balance: { decrement: input.amount.toString() } },
    });
    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, { userId, action: "PURCHASE_PAY", entityType: "Purchase", entityId: purchase.id }),
    );
    return { paidAmount: updated.paidAmount.toString(), dueAmount: updated.dueAmount.toString(), purchaseNumber: purchase.purchaseNumber };
  });
  void notify({
    type: "SUPPLIER_PAYMENT", title: "SUPPLIER_PAYMENT",
    body: `${result.purchaseNumber} · ${input.amount}`,
    entityType: "Purchase", entityId: input.purchaseId, href: "/procurement/purchases",
  });
  return { paidAmount: result.paidAmount, dueAmount: result.dueAmount };
}

// ---------------------------------------------------------------------------
// Lists / detail
// ---------------------------------------------------------------------------

export async function listPurchases(opts: {
  q?: string; supplierId?: string; page?: number; pageSize?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const q = opts.q?.trim();
  const where: Prisma.PurchaseWhereInput = {
    ...(opts.supplierId ? { supplierId: opts.supplierId } : {}),
    ...(q
      ? {
          OR: [
            { purchaseNumber: { contains: q, mode: "insensitive" } },
            { supplier: { name: { contains: q, mode: "insensitive" } } },
            { supplier: { nameAr: { contains: q } } },
          ],
        }
      : {}),
  };
  const [rows, count] = await Promise.all([
    db.purchase.findMany({
      where,
      include: { supplier: { select: { code: true, name: true, nameAr: true } } },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchase.count({ where }),
  ]);
  return { rows, total: count, page, pageSize };
}

export async function getPurchaseDetail(id: string) {
  const p = await db.purchase.findUnique({
    where: { id },
    include: {
      supplier: { select: { code: true, name: true, nameAr: true } },
      user: { select: { username: true, fullName: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { sku: true, name: true, nameAr: true, unit: { select: { symbol: true } } } },
        },
      },
      returns: { select: { id: true, returnNumber: true, total: true, date: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND", "Purchase not found");
  return p;
}

/** Purchased-minus-returned availability per product for the returns wizard. */
export async function getPurchaseForReturn(purchaseId: string) {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: { select: { id: true, code: true, name: true, nameAr: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { sku: true, name: true, nameAr: true } },
        },
      },
      returns: { select: { items: { select: { productId: true, quantity: true } } } },
    },
  });
  if (!purchase) throw new AppError("NOT_FOUND", "Purchase not found");

  const returnedByProduct = new Map<string, Decimal>();
  for (const ret of purchase.returns) {
    for (const ri of ret.items) {
      returnedByProduct.set(
        ri.productId,
        (returnedByProduct.get(ri.productId) ?? new Decimal(0)).plus(D(ri.quantity)),
      );
    }
  }

  return {
    id: purchase.id,
    purchaseNumber: purchase.purchaseNumber,
    supplier: purchase.supplier,
    date: purchase.date,
    items: purchase.items.map((i) => {
      const returned = returnedByProduct.get(i.productId) ?? new Decimal(0);
      return {
        id: i.id,
        productId: i.productId,
        sku: i.product.sku,
        name: i.product.name,
        nameAr: i.product.nameAr,
        purchased: i.quantity.toString(),
        alreadyReturned: returned.toString(),
        maxReturnable: D(i.quantity).minus(returned).toString(),
        unitCost: i.unitCost.toString(),
      };
    }),
  };
}

export async function listPurchaseReturns(opts: { q?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 25;
  const q = opts.q?.trim();
  const where: Prisma.PurchaseReturnWhereInput = q
    ? {
        OR: [
          { returnNumber: { contains: q, mode: "insensitive" } },
          { supplier: { name: { contains: q, mode: "insensitive" } } },
          { supplier: { nameAr: { contains: q } } },
        ],
      }
    : {};
  const [rows, count] = await Promise.all([
    db.purchaseReturn.findMany({
      where,
      include: { supplier: { select: { code: true, name: true, nameAr: true } } },
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.purchaseReturn.count({ where }),
  ]);
  return { rows, total: count, page, pageSize };
}

// ---------------------------------------------------------------------------
// F5 â€” Purchase return. Serializable txn:
//   validate vs purchased âˆ’ alreadyReturned â†’ FEFO batch consumption â†’
//   PURCHASE_RETURN movements â†’ inventory decrement â†’ refund CASH (money out)
//   or CREDIT (supplier balance âˆ’=).
// ---------------------------------------------------------------------------

export async function createPurchaseReturn(userId: string, raw: unknown) {
  const input = purchaseReturnSchema.parse(raw);

  const result = await db.$transaction(async (tx) => {
    const purchase = await tx.purchase.findUnique({
      where: { id: input.purchaseId },
      include: {
        items: true,
        returns: { select: { items: { select: { productId: true, quantity: true } } } },
      },
    });
    if (!purchase) throw new AppError("NOT_FOUND", "Purchase not found");

    // Per-product caps: purchased âˆ’ alreadyReturned across ALL prior returns.
    const purchasedByProduct = new Map<string, Decimal>();
    for (const i of purchase.items) {
      purchasedByProduct.set(i.productId, (purchasedByProduct.get(i.productId) ?? new Decimal(0)).plus(D(i.quantity)));
    }
    const returnedByProduct = new Map<string, Decimal>();
    for (const ret of purchase.returns) {
      for (const ri of ret.items) {
        returnedByProduct.set(
          ri.productId,
          (returnedByProduct.get(ri.productId) ?? new Decimal(0)).plus(D(ri.quantity)),
        );
      }
    }

    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, sku: true, trackBatches: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    interface RetLine {
      productId: string; sku: string; trackBatches: boolean;
      quantity: Decimal; unitCost: Decimal; lineTotal: Decimal;
    }
    const lines: RetLine[] = [];
    let total = new Decimal(0);
    for (const item of input.items) {
      const purchased = purchasedByProduct.get(item.productId);
      if (purchased === undefined) {
        throw new AppError("VALIDATION_ERROR", "Product not on this purchase");
      }
      const alreadyReturned = returnedByProduct.get(item.productId) ?? new Decimal(0);
      const cap = purchased.minus(alreadyReturned);
      const qty = q3(item.quantity);
      if (qty.lte(0)) throw new AppError("VALIDATION_ERROR", "Quantity must be positive");
      if (qty.gt(cap)) {
        throw new AppError(
          "OVER_RETURN",
          `${byId.get(item.productId)?.sku ?? item.productId}: returnable ${cap}, requested ${qty}`,
        );
      }
      const cost = money(item.unitCost);
      total = total.plus(cost.mul(qty));
      const p = byId.get(item.productId)!;
      lines.push({
        productId: item.productId,
        sku: p.sku,
        trackBatches: p.trackBatches,
        quantity: qty,
        unitCost: cost,
        lineTotal: cost.mul(qty),
      });
    }

    // Merge duplicate product lines before stock math.
    const merged = new Map<string, RetLine>();
    for (const l of lines) {
      const ex = merged.get(l.productId);
      if (ex) {
        ex.quantity = ex.quantity.plus(l.quantity);
        ex.lineTotal = ex.lineTotal.plus(l.lineTotal);
      } else merged.set(l.productId, { ...l });
    }
    const finalLines = [...merged.values()];

    const settings = await tx.systemSettings.findUnique({ where: { id: "system" } });

    const ret = await tx.purchaseReturn.create({
      data: {
        returnNumber: await nextNumber(tx, "purchaseReturn"),
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        userId,
        subtotal: total.toString(),
        total: total.toString(),
        reason: input.reason,
        refundAmount: input.refundMethod === "CASH" ? total.toString() : "0",
        creditAmount: input.refundMethod === "CREDIT" ? total.toString() : "0",
        items: {
          create: finalLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity.toString(),
            unitCost: l.unitCost.toString(),
            lineTotal: l.lineTotal.toString(),
          })),
        },
      },
      include: { items: { orderBy: { id: "asc" } } },
    });

    // FEFO batch consumption + movements + aggregate decrement.
    for (let i = 0; i < finalLines.length; i++) {
      const line = finalLines[i]!;
      const item = ret.items[i]!;
      const batchId: string | null = null;
      if (line.trackBatches && (settings?.batchTrackingEnabled ?? true)) {
        const batches = await tx.productBatch.findMany({
          where: { productId: line.productId, quantity: { gt: 0 } },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        });
        let remaining = line.quantity;
        for (const b of batches) {
          if (remaining.lte(0)) break;
          const take = Decimal.min(D(b.quantity), remaining);
          await tx.productBatch.update({
            where: { id: b.id },
            data: { quantity: D(b.quantity).minus(take).toString() },
          });
          remaining = remaining.minus(take);
        }
        if (remaining.gt(0)) {
          throw new AppError("INSUFFICIENT_STOCK", `Batch quantities insufficient for ${line.sku}`);
        }
      }
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          batchId,
          type: "PURCHASE_RETURN",
          quantity: line.quantity.negated().toString(),
          unitCost: line.unitCost.toString(),
          refType: "PurchaseReturn",
          refId: item.id,
          userId,
        },
      });
      await tx.inventory.update({
        where: { productId: line.productId },
        data: { quantity: { decrement: line.quantity.toString() } },
      });
    }

    // Refund side-effects.
    if (input.refundMethod === "CREDIT") {
      await tx.supplier.update({
        where: { id: purchase.supplierId },
        data: { balance: { decrement: total.toString() } },
      });
    }

    await import("@/shared/core/audit").then(({ recordAudit }) =>
      recordAudit(tx, { userId, action: "PURCHASE_RETURN_CREATE", entityType: "PurchaseReturn", entityId: ret.id }),
    );

    return {
      returnId: ret.id,
      returnNumber: ret.returnNumber,
      total: total.toNumber(),
      refundMethod: input.refundMethod,
    };
  });
  void notify({
    type: "PURCHASE_RETURN", title: "PURCHASE_RETURN",
    body: `${result.returnNumber} · ${result.total}`,
    entityType: "PurchaseReturn", entityId: result.returnId, href: "/procurement/returns",
  });
  return result;
}
