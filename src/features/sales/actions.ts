"use server";

import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import {
  createSale, cancelSale, createSaleReturn,
  searchProductsForPos, findByBarcode, getSaleDetail, getSaleByInvoice,
} from "./service";
import { checkoutSchema } from "./schema";

export async function checkoutAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("sales.create");
    const parsed = checkoutSchema.parse(raw);
    const result = await createSale(user.id, parsed);
    return ok(result);
  });
}

export async function cancelSaleAction(saleId: string) {
  return guard(async () => {
    const user = await requirePermission("sales.cancel");
    const result = await cancelSale(user.id, saleId);
    return ok(result);
  });
}

export async function createSaleReturnAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("sales.refund");
    const result = await createSaleReturn(user.id, raw);
    return ok(result);
  });
}

export async function posSearchAction(q: string) {
  return guard(async () => {
    await requirePermission("sales.create");
    const rows = await searchProductsForPos(q);
    // Serialize to plain shapes for the RSC boundary.
    return ok(rows.map((p) => ({
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      nameAr: p.nameAr,
      sellingPrice: String(p.sellingPrice),
      unitSymbol: p.unit.symbol,
      quantity: p.inventory ? String(p.inventory.quantity) : null,
    })));
  });
}

export async function barcodeLookupAction(barcode: string) {
  return guard(async () => {
    await requirePermission("sales.create");
    return ok({ productId: await findByBarcode(barcode) });
  });
}

export async function saleDetailAction(id: string) {
  return guard(async () => {
    await requirePermission("sales.view");
    return ok(await getSaleDetail(id));
  });
}

export async function saleByInvoiceAction(invoiceNumber: string) {
  return guard(async () => {
    await requirePermission("sales.refund");
    return ok(await getSaleByInvoice(invoiceNumber));
  });
}
