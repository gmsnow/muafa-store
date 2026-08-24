"use server";

import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import {
  saveSupplier, softDeleteSupplier, getSupplierForEdit,
  listPurchaseOrders, getPoDetail, createPurchaseOrder, transitionPo,
  receivePurchase, payPurchase,
  listPurchases, getPurchaseDetail, getPurchaseForReturn,
  listPurchaseReturns, createPurchaseReturn,
} from "./service";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";

export async function supplierOptionsAction() {
  return guard(async () => {
    await requirePermission("procurement.view");
    const rows = await (await import("./service")).listSuppliers({ pageSize: 500 });
    return ok(rows.rows.map((s) => ({ id: s.id, code: s.code, name: s.name, nameAr: s.nameAr, balance: String(s.balance) })));
  });
}

/** Product picker for PO/receiving builders (includes cost price). */
export async function procProductSearchAction(q: string) {
  return guard(async () => {
    await requirePermission("procurement.view");
    const { searchProductsForProcurement } = await import("./service");
    const rows = await searchProductsForProcurement(q);
    return ok(rows.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      nameAr: p.nameAr,
      costPrice: String(p.costPrice),
      trackBatches: p.trackBatches,
      trackExpiry: p.trackExpiry,
      unitSymbol: p.unit.symbol ?? "",
    })));
  });
}

export async function saveSupplierAction(id: string | null, raw: unknown) {
  return guard(async () => {
    await requirePermission("suppliers.manage");
    return ok(await saveSupplier(id, raw));
  });
}

export async function deleteSupplierAction(id: string) {
  return guard(async () => {
    await requirePermission("suppliers.manage");
    await softDeleteSupplier(id);
    return ok({ deleted: true });
  });
}

export async function supplierEditAction(id: string) {
  return guard(async () => {
    await requirePermission("suppliers.view");
    const s = await getSupplierForEdit(id);
    return ok({
      id: s.id, name: s.name, nameAr: s.nameAr, company: s.company,
      phone: s.phone, email: s.email, address: s.address,
      creditLimit: String(s.creditLimit), paymentTerms: s.paymentTerms, notes: s.notes,
      isActive: s.isActive,
    });
  });
}

export async function poListAction(status?: string, q?: string) {
  return guard(async () => {
    await requirePermission("procurement.view");
    return ok(await listPurchaseOrders({
      status: status as PurchaseOrderStatus | undefined,
      q,
    }));
  });
}

export async function poDetailAction(id: string) {
  return guard(async () => {
    await requirePermission("procurement.view");
    return ok(await getPoDetail(id));
  });
}

export async function createPurchaseOrderAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("procurement.create");
    return ok(await createPurchaseOrder(user.id, raw));
  });
}

export async function transitionPoAction(poId: string, action: "submit" | "approve" | "order" | "cancel") {
  return guard(async () => {
    const user = await requirePermission("procurement.create");
    return ok(await transitionPo(user.id, poId, action));
  });
}

export async function receivePurchaseAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("procurement.receive");
    return ok(await receivePurchase(user.id, raw));
  });
}

export async function payPurchaseAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("procurement.receive");
    return ok(await payPurchase(user.id, raw));
  });
}

export async function purchaseListAction(q?: string, supplierId?: string) {
  return guard(async () => {
    await requirePermission("procurement.view");
    return ok(await listPurchases({ q, supplierId }));
  });
}

export async function purchaseDetailAction(id: string) {
  return guard(async () => {
    await requirePermission("procurement.view");
    return ok(await getPurchaseDetail(id));
  });
}

export async function purchaseForReturnAction(purchaseId: string) {
  return guard(async () => {
    await requirePermission("procurement.return");
    return ok(await getPurchaseForReturn(purchaseId));
  });
}

export async function purchaseReturnListAction(q?: string) {
  return guard(async () => {
    await requirePermission("procurement.view");
    return ok(await listPurchaseReturns({ q }));
  });
}

export async function createPurchaseReturnAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("procurement.return");
    return ok(await createPurchaseReturn(user.id, raw));
  });
}
