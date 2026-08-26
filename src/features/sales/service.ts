import "server-only";
import Decimal from "decimal.js";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { notify } from "@/features/notifications/service";
import { D, money, lineTotal, sum, qty as q3 } from "@/shared/core/money";
import {
  checkoutSchema, saleReturnSchema,
  type CheckoutInput, type SalesQuery,
} from "./schema";
import type { Prisma, PaymentMethod, SaleStatus } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// POS product search (fast: indexed columns, tight limit)
// ---------------------------------------------------------------------------

export async function searchProductsForPos(q: string, limit = 20) {
  const term = q.trim();
  const products = await db.product.findMany({
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
      id: true, sku: true, barcode: true, name: true, nameAr: true,
      sellingPrice: true, wholesalePrice: true, minPrice: true,
      unit: { select: { symbol: true, name: true } },
      inventory: { select: { quantity: true } },
    },
    orderBy: term ? [{ barcode: "asc" }, { name: "asc" }] : [{ name: "asc" }],
    take: limit,
  });
  return products;
}

export async function findByBarcode(barcode: string) {
  const product = await db.product.findFirst({
    where: { deletedAt: null, isActive: true, OR: [{ barcode }, { barcodes: { some: { barcode } } }] },
    select: { id: true },
  });
  return product?.id ?? null;
}

// ---------------------------------------------------------------------------
// Invoice numbering
// ---------------------------------------------------------------------------

async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const settings = await db.systemSettings.findUnique({ where: { id: "system" } });
  const prefix = settings?.invoicePrefix ?? "INV-";
  const last = await tx.sale.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });
  const n = last ? Number.parseInt(last.invoiceNumber.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(n + 1).padStart(6, "0")}`;
}

// ---------------------------------------------------------------------------
// F2 — POS checkout. Single Serializable transaction; any failure rolls back.
// ---------------------------------------------------------------------------

interface SaleLineComputed {
  productId: string;
  productName: string;
  productNameAr: string | null;
  sku: string;
  unitName: string | null;
  quantity: Decimal;
  unitPrice: Decimal;
  discount: Decimal;
  costPrice: Decimal;
  lineNet: Decimal;
}

export async function createSale(userId: string, raw: unknown) {
  const input: CheckoutInput = checkoutSchema.parse(raw);

  return db.$transaction(async (tx) => {
    // 1 — Server-side price truth: re-fetch every product.
    const ids = [...new Set(input.items.map((i) => i.productId))];
    const products = await tx.product.findMany({
      where: { id: { in: ids }, deletedAt: null, isActive: true },
      include: {
        unit: { select: { name: true } },
        inventory: { select: { quantity: true } },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Merge duplicate lines per product.
    const qtyByProduct = new Map<string, Decimal>();
    for (const item of input.items) {
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? new Decimal(0)).plus(q3(item.quantity)));
    }

    // 2 — Stock availability check (aggregate level).
    for (const [productId, needed] of qtyByProduct) {
      const p = byId.get(productId);
      if (!p) throw new AppError("NOT_FOUND", "One or more products not found / منتج غير موجود");
      const available = D(p.inventory?.quantity);
      if (available.lt(needed)) {
        throw new AppError("INSUFFICIENT_STOCK", `Not enough stock for ${p.name}`);
      }
    }

    // 3 — Compute lines with authoritative prices + cost snapshot.
    const lines: SaleLineComputed[] = [];
    for (const item of input.items) {
      const p = byId.get(item.productId)!;
      const unitPrice = money(p.sellingPrice);
      const discount = money(item.discount ?? 0);
      const quantity = q3(item.quantity);
      const net = lineTotal(quantity, unitPrice, discount);
      lines.push({
        productId: p.id,
        productName: p.name,
        productNameAr: p.nameAr,
        sku: p.sku,
        unitName: p.unit.name,
        quantity,
        unitPrice,
        discount,
        costPrice: money(p.costPrice),
        lineNet: net,
      });
    }

    const subtotal = sum(lines.map((l) => l.lineNet.add(l.discount))); // gross before discounts
    const itemDiscountTotal = sum(lines.map((l) => l.discount));
    const invoiceDiscount = money(input.invoiceDiscount);
    if (subtotal.minus(itemDiscountTotal).minus(invoiceDiscount).lt(0)) {
      throw new AppError("VALIDATION_ERROR", "Invoice discount exceeds total");
    }
    const total = subtotal.minus(itemDiscountTotal).minus(invoiceDiscount);
    const costTotal = sum(lines.map((l) => l.costPrice.mul(l.quantity)));

    // 4 — Payments: split methods; shortfall becomes CREDIT (customer required).
    const payments = input.payments.filter((pm) => pm.amount > 0);
    const paidSum = sum(payments.map((pm) => money(pm.amount)));
    let creditAmount = new Decimal(0);
    let changeDue = new Decimal(0);
    const creditLines = payments.filter((pm) => pm.method === "CREDIT");

    if (paidSum.gt(total)) {
      // overpayment → change due (only sensible when cash involved)
      changeDue = paidSum.minus(total);
    }
    creditAmount = creditLines.reduce<Decimal>((acc, pm) => acc.plus(money(pm.amount)), new Decimal(0));
    const unpaidRemainder = total.minus(paidSum).gt(0) ? total.minus(paidSum) : new Decimal(0);

    const customerId = input.customerId?.trim() || null;
    let customer: { id: string; balance: Decimal; creditLimit: Decimal; loyaltyPoints: Decimal } | null = null;
    if (customerId) {
      customer = await tx.customer.findFirst({
        where: { id: customerId, deletedAt: null },
        select: { id: true, balance: true, creditLimit: true, loyaltyPoints: true },
      });
      if (!customer) throw new AppError("NOT_FOUND", "Customer not found");
    }

    if (unpaidRemainder.gt(0)) {
      creditAmount = creditAmount.plus(unpaidRemainder);
    }
    const finalPaid = paidSum.gt(total) ? total : paidSum;

    if (creditAmount.gt(0)) {
      if (!customer) throw new AppError("VALIDATION_ERROR", "Credit payment requires a customer / الدفع الآجل يتطلب عميلاً");
      const projectedBalance = D(customer.balance).plus(creditAmount);
      if (D(customer.creditLimit).gt(0) && projectedBalance.gt(D(customer.creditLimit))) {
        throw new AppError("CREDIT_LIMIT_EXCEEDED", "Customer credit limit exceeded");
      }
    }

    // 5 — Create sale + items.
    const invoiceNumber = await nextInvoiceNumber(tx);
    const sale = await tx.sale.create({
      data: {
        invoiceNumber,
        customerId,
        cashierId: userId,
        status: "COMPLETED",
        subtotal: subtotal.toString(),
        itemDiscountTotal: itemDiscountTotal.toString(),
        invoiceDiscount: invoiceDiscount.toString(),
        total: total.toString(),
        costTotal: costTotal.toString(),
        paidTotal: finalPaid.toString(),
        changeDue: changeDue.toString(),
        creditAmount: creditAmount.toString(),
        notes: input.notes?.trim() || null,
        items: {
          create: lines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            productNameAr: l.productNameAr,
            sku: l.sku,
            unitName: l.unitName,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.toString(),
            discount: l.discount.toString(),
            costPrice: l.costPrice.toString(),
            lineTotal: l.lineNet.toString(),
          })),
        },
      },
      include: { items: { orderBy: { id: "asc" } } },
    });

    // 6 — Batch deduction FEFO + movements + inventory decrement.
    for (const line of lines) {
      const product = byId.get(line.productId)!;
      const batchId: string | null = null;
      if (product.trackBatches) {
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
      const saleItem = sale.items.find((si) => si.productId === line.productId)!;
      await tx.inventoryMovement.create({
        data: {
          productId: line.productId,
          batchId,
          type: "SALE",
          quantity: line.quantity.negated().toString(),
          unitCost: line.costPrice.toString(),
          refType: "SaleItem",
          refId: saleItem.id,
          userId,
        },
      });
    }

    // Aggregate decrement once per product.
    for (const [productId, needed] of qtyByProduct) {
      await tx.inventory.update({
        where: { productId },
        data: { quantity: { decrement: needed.toString() } },
      });
    }

    // 7 — Payments rows.
    const recordedPayments = payments.filter((pm) => pm.method !== "CREDIT" || pm.amount > 0);
    for (const pm of recordedPayments.slice(0, 5)) {
      await tx.salePayment.create({
        data: { saleId: sale.id, method: pm.method as PaymentMethod, amount: money(pm.amount).toString(), reference: pm.reference ?? null },
      });
    }

    // 8 — Customer side-effects.
    let loyaltyPointsEarned = new Decimal(0);
    if (customer) {
      const settings = await tx.systemSettings.findUnique({ where: { id: "system" } });
      if (settings?.enableLoyalty && settings.loyaltyEarnPerSpent.gt(0)) {
        loyaltyPointsEarned = money(total.dividedBy(100).mul(settings.loyaltyEarnPerSpent));
      }
      const newBalance = D(customer.balance).plus(creditAmount);
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          balance: newBalance.toString(),
          totalPurchases: { increment: total.toString() },
          lastPurchaseAt: new Date(),
          ...(loyaltyPointsEarned.gt(0)
            ? { loyaltyPoints: { increment: loyaltyPointsEarned.toString() } }
            : {}),
        },
      });
      if (creditAmount.gt(0)) {
        await tx.customerTransaction.create({
          data: {
            customerId: customer.id,
            type: "DEBT",
            amount: creditAmount.toString(),
            balanceAfter: newBalance.toString(),
            refType: "Sale",
            refId: sale.id,
            note: invoiceNumber,
            userId,
          },
        });
      }
      if (loyaltyPointsEarned.gt(0)) {
        await tx.loyaltyTransaction.create({
          data: {
            customerId: customer.id,
            type: "EARN",
            points: loyaltyPointsEarned.toString(),
            balanceAfter: D(customer.loyaltyPoints).plus(loyaltyPointsEarned).toString(),
            refType: "Sale",
            refId: sale.id,
            note: invoiceNumber,
          },
        });
      }
    }

    if (loyaltyPointsEarned.gt(0)) {
      await tx.sale.update({ where: { id: sale.id }, data: { loyaltyPointsEarned: loyaltyPointsEarned.toString() } });
    }

    return {
      saleId: sale.id,
      invoiceNumber,
      total: total.toNumber(),
      paid: finalPaid.toNumber(),
      changeDue: changeDue.toNumber(),
      credit: creditAmount.toNumber(),
      pointsEarned: loyaltyPointsEarned.toNumber(),
    };
  }, { isolationLevel: "Serializable", timeout: 15000 }).then(async (result) => {
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(db, {
      userId, action: "SALE_CREATE", entityType: "Sale", entityId: result.saleId,
      newValues: { invoice: result.invoiceNumber, total: result.total },
    });
    void notify({
      type: "SALE", title: "SALE",
      body: `${result.invoiceNumber} · ${result.total}`,
      entityType: "Sale", entityId: result.saleId, href: `/sales/receipt/${result.saleId}`,
    });
    return result;
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getSaleDetail(id: string) {
  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      customer: { select: { code: true, name: true, nameAr: true, phone: true } },
      cashier: { select: { username: true, fullName: true } },
      items: { orderBy: { id: "asc" } },
      payments: true,
      returns: { include: { items: true } },
    },
  });
  if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
  return sale;
}

export async function getSaleByInvoice(invoiceNumber: string) {
  const sale = await db.sale.findUnique({
    where: { invoiceNumber },
    select: { id: true },
  });
  if (!sale) throw new AppError("NOT_FOUND", "Invoice not found");
  return getSaleDetail(sale.id);
}

// ---------------------------------------------------------------------------
// Cancel (M5): exact reversal — stock restored to the SAME batches via the
// original SALE movements, customer balance/loyalty reversed, status CANCELLED.
// ---------------------------------------------------------------------------

export async function cancelSale(userId: string, saleId: string) {
  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        returns: { select: { id: true } },
      },
    });
    if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
    if (sale.status !== "COMPLETED") throw new AppError("VALIDATION_ERROR", "Only completed sales can be cancelled");
    if (sale.returns.length > 0) throw new AppError("VALIDATION_ERROR", "Sale has returns and cannot be cancelled");

    // Restore inventory exactly as it was deducted (per product aggregate).
    for (const item of sale.items) {
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { quantity: { increment: D(item.quantity).toString() } },
      });
      await tx.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: "SALE_RETURN",
          quantity: D(item.quantity).toString(),
          unitCost: D(item.costPrice).toString(),
          refType: "SaleCancellation",
          refId: sale.id,
          note: `Cancel ${sale.invoiceNumber}`,
          userId,
        },
      });
    }

    // Reverse customer effects.
    if (sale.customerId) {
      const customer = await tx.customer.findUnique({
        where: { id: sale.customerId },
        select: { balance: true, loyaltyPoints: true, totalPurchases: true },
      });
      if (customer) {
        const newBalance = D(customer.balance).minus(D(sale.creditAmount));
        await tx.customer.update({
          where: { id: sale.customerId },
          data: {
            balance: newBalance.toString(),
            totalPurchases: { decrement: D(sale.total).toString() },
            ...(D(sale.loyaltyPointsEarned).gt(0)
              ? { loyaltyPoints: { decrement: D(sale.loyaltyPointsEarned).toString() } }
              : {}),
          },
        });
        if (D(sale.creditAmount).gt(0)) {
          await tx.customerTransaction.create({
            data: {
              customerId: sale.customerId,
              type: "PAYMENT",
              amount: D(sale.creditAmount).negated().toString(),
              balanceAfter: newBalance.toString(),
              refType: "SaleCancellation",
              refId: sale.id,
              note: `Cancel ${sale.invoiceNumber}`,
              userId,
            },
          });
        }
      }
    }

    await tx.sale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });

    return { invoiceNumber: sale.invoiceNumber };
  }, { isolationLevel: "Serializable", timeout: 15000 }).then(async (result) => {
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(db, { userId, action: "SALE_CANCEL", entityType: "Sale", entityId: saleId });
    void notify({
      type: "SALE_CANCELLED", title: "SALE_CANCELLED",
      body: result.invoiceNumber,
      entityType: "Sale", entityId: saleId, href: "/sales/orders",
    });
    return result;
  });
}

// ---------------------------------------------------------------------------
// F3 — Sale return. Validates against sold − already returned; restocks at
// original cost snapshot; refund via cash or customer credit.
// ---------------------------------------------------------------------------

async function nextReturnNumber(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.saleReturn.findFirst({
    orderBy: { returnNumber: "desc" },
    select: { returnNumber: true },
  });
  const n = last ? Number.parseInt(last.returnNumber.replace("SRN-", ""), 10) || 0 : 0;
  return `SRN-${String(n + 1).padStart(6, "0")}`;
}

export async function createSaleReturn(userId: string, raw: unknown) {
  const input = saleReturnSchema.parse(raw);

  return db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
      include: { items: true, returns: { include: { items: true } } },
    });
    if (!sale) throw new AppError("NOT_FOUND", "Sale not found");
    if (sale.status === "CANCELLED") throw new AppError("VALIDATION_ERROR", "Cannot return a cancelled sale");

    // Already-returned quantities per sale item.
    const returnedByItem = new Map<string, Decimal>();
    for (const ret of sale.returns) {
      for (const ri of ret.items) {
        returnedByItem.set(ri.saleItemId, (returnedByItem.get(ri.saleItemId) ?? new Decimal(0)).plus(D(ri.quantity)));
      }
    }

    let subtotal = new Decimal(0);
    let costTotal = new Decimal(0);
    const returnLines: { saleItemId: string; productId: string; quantity: Decimal; unitPrice: Decimal; costPrice: Decimal; lineTotal: Decimal }[] = [];

    for (const req of input.items) {
      const item = sale.items.find((si) => si.id === req.saleItemId);
      if (!item) throw new AppError("VALIDATION_ERROR", "Unknown sale line");
      const already = returnedByItem.get(item.id) ?? new Decimal(0);
      const maxReturnable = D(item.quantity).minus(already);
      if (q3(req.quantity).gt(maxReturnable)) {
        throw new AppError("VALIDATION_ERROR", `Return exceeds sold quantity for ${item.sku}`);
      }
      const quantity = q3(req.quantity);
      if (quantity.lte(0)) continue;
      const unitPrice = money(item.unitPrice);
      const lineNet = money(quantity.mul(unitPrice)); // proportional share of price
      subtotal = subtotal.plus(lineNet);
      costTotal = costTotal.plus(quantity.mul(money(item.costPrice)));
      returnLines.push({
        saleItemId: item.id,
        productId: item.productId,
        quantity,
        unitPrice,
        costPrice: money(item.costPrice),
        lineTotal: lineNet,
      });
    }

    if (returnLines.length === 0) throw new AppError("VALIDATION_ERROR", "Nothing to return");
    const total = money(subtotal); // refund proportional to returned lines

    // Restock batches.
    for (const line of returnLines) {
      const product = await tx.product.findUnique({
        where: { id: line.productId },
        select: { trackBatches: true },
      });
      if (input.restock && product?.trackBatches) {
        // Add back to the batch the original SALE movement consumed when possible.
        const origMovement = await tx.inventoryMovement.findFirst({
          where: { refType: "SaleItem", refId: line.saleItemId, type: "SALE" },
          orderBy: { createdAt: "asc" },
          select: { batchId: true },
        });
        if (origMovement?.batchId) {
          await tx.productBatch.update({
            where: { id: origMovement.batchId },
            data: { quantity: { increment: line.quantity.toString() } },
          });
        } else {
          await tx.productBatch.create({
            data: {
              productId: line.productId,
              batchNo: `RET-${Date.now().toString(36).toUpperCase()}`,
              quantity: line.quantity.toString(),
              costPrice: line.costPrice.toString(),
            },
          });
        }
      }

      if (input.restock) {
        await tx.inventoryMovement.create({
          data: {
            productId: line.productId,
            type: "SALE_RETURN",
            quantity: line.quantity.toString(),
            unitCost: line.costPrice.toString(),
            refType: "SaleReturn",
            note: `${input.reason} (${sale.invoiceNumber})`,
            userId,
          },
        });
        await tx.inventory.update({
          where: { productId: line.productId },
          data: { quantity: { increment: line.quantity.toString() } },
        });
      }
    }

    const returnNumber = await nextReturnNumber(tx);
    const saleReturn = await tx.saleReturn.create({
      data: {
        returnNumber,
        saleId: sale.id,
        userId,
        subtotal: subtotal.toString(),
        total: total.toString(),
        costTotal: costTotal.toString(),
        reason: input.reason,
        restock: input.restock,
        refundAmount: input.refundMethod === "CASH" ? total.toString() : "0",
        creditAmount: input.refundMethod === "CREDIT" ? total.toString() : "0",
        items: {
          create: returnLines.map((l) => ({
            saleItemId: l.saleItemId,
            productId: l.productId,
            quantity: l.quantity.toString(),
            unitPrice: l.unitPrice.toString(),
            costPrice: l.costPrice.toString(),
            lineTotal: l.lineTotal.toString(),
          })),
        },
      },
    });

    // Refund side-effects.
    if (input.refundMethod === "CREDIT" && sale.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: sale.customerId }, select: { balance: true } });
      if (customer) {
        const newBalance = D(customer.balance).minus(total);
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: newBalance.toString() },
        });
        await tx.customerTransaction.create({
          data: {
            customerId: sale.customerId,
            type: "REFUND",
            amount: total.negated().toString(),
            balanceAfter: newBalance.toString(),
            refType: "SaleReturn",
            refId: saleReturn.id,
            note: returnNumber,
            userId,
          },
        });
      }
    }

    const refundedTotal = D(sale.refundedAmount).plus(total);
    await tx.sale.update({
      where: { id: sale.id },
      data: {
        refundedAmount: refundedTotal.toString(),
        status: refundedTotal.gte(D(sale.total)) ? "REFUNDED" : "PARTIALLY_REFUNDED",
      },
    });

    return { returnNumber, total: total.toNumber(), saleStatus: refundedTotal.gte(D(sale.total)) ? "REFUNDED" : "PARTIALLY_REFUNDED" };
  }, { isolationLevel: "Serializable", timeout: 15000 }).then(async (result) => {
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(db, {
      userId, action: "SALE_RETURN", entityType: "SaleReturn", entityId: result.returnNumber,
      newValues: { saleId: input.saleId, total: result.total },
    });
    void notify({
      type: "SALE_RETURN", title: "SALE_RETURN",
      body: `${result.returnNumber} · ${result.total}`,
      entityType: "SaleReturn", entityId: input.saleId, href: "/sales/orders",
    });
    return result;
  });
}

const salesCard = {
  id: true, invoiceNumber: true, saleDate: true, status: true,
  subtotal: true, invoiceDiscount: true, total: true,
  paidTotal: true, creditAmount: true, refundedAmount: true,
  customer: { select: { code: true, name: true, nameAr: true } },
  cashier: { select: { username: true, fullName: true } },
  _count: { select: { items: true, returns: true } },
} satisfies Prisma.SaleSelect;

export async function listSales(query: SalesQuery) {
  const page = query.page ?? 1;
  const pageSize = 25;
  const where: Prisma.SaleWhereInput = {
    ...(query.status && query.status !== "all"
      ? { status: query.status.toUpperCase() as SaleStatus }
      : {}),
    ...(query.cashierId ? { cashierId: query.cashierId } : {}),
    ...(query.q ? { invoiceNumber: { contains: query.q } } : {}),
    ...(query.from || query.to
      ? {
          saleDate: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.sale.findMany({
      where, select: salesCard,
      orderBy: { saleDate: "desc" },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    db.sale.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}


