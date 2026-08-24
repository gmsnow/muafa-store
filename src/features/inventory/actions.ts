"use server";

import { guard, ok, fail } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import {
  listProducts, getProductForEdit, createProduct, updateProduct, softDeleteProduct,
  importProductsCsv, exportProductsCsv,
  saveCategory, deleteCategory, saveBrand, deleteBrand,
  saveUnit, deleteUnit, addConversion, deleteConversion,
  createAdjustment, listStock, listMovements, type ProductCard,
} from "./service";

// --- Products ---------------------------------------------------------------

export async function createProductAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("products.create");
    const card = await createProduct(user.id, raw);
    return ok({ id: card.id });
  });
}

export async function updateProductAction(id: string, raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("products.update");
    const card = await updateProduct(user.id, id, raw);
    return ok({ id: card.id });
  });
}

export async function deleteProductAction(id: string) {
  return guard(async () => {
    const user = await requirePermission("products.delete");
    await softDeleteProduct(user.id, id);
    return ok({ deleted: true });
  });
}

export async function exportProductsAction() {
  return guard(async () => {
    await requirePermission("products.export");
    const csv = await exportProductsCsv();
    return ok({ csv });
  });
}

export async function importProductsAction(csvText: string) {
  return guard(async () => {
    const user = await requirePermission("products.import");
    const report = await importProductsCsv(user.id, csvText);
    return ok(report);
  });
}

export async function getProductForEditAction(id: string) {
  return guard(async () => {
    await requirePermission("products.view");
    const product = await getProductForEdit(id);
    return ok(product);
  });
}

export async function productOptionsAction(q = "") {
  return guard(async () => {
    await requirePermission("products.view");
    const { rows } = await listProducts({ q, status: "active", page: 1, pageSize: 20 });
    return ok(rows.map((p: ProductCard) => ({
      id: p.id, sku: p.sku, name: p.name, nameAr: p.nameAr,
      price: p.sellingPrice, unitSymbol: p.unit.symbol ?? p.unit.name,
      quantity: p.inventory?.quantity ?? 0,
    })));
  });
}

// --- Catalog ----------------------------------------------------------------

export async function saveCategoryAction(id: string | null, raw: unknown) {
  return guard(async () => {
    await requirePermission("catalog.categories");
    await saveCategory(id, raw);
    return ok({});
  });
}

export async function deleteCategoryAction(id: string) {
  return guard(async () => {
    await requirePermission("catalog.categories");
    await deleteCategory(id);
    return ok({});
  });
}

export async function saveBrandAction(id: string | null, raw: unknown) {
  return guard(async () => {
    await requirePermission("catalog.brands");
    await saveBrand(id, raw);
    return ok({});
  });
}

export async function deleteBrandAction(id: string) {
  return guard(async () => {
    await requirePermission("catalog.brands");
    await deleteBrand(id);
    return ok({});
  });
}

export async function saveUnitAction(id: string | null, raw: unknown) {
  return guard(async () => {
    await requirePermission("catalog.units");
    await saveUnit(id, raw);
    return ok({});
  });
}

export async function deleteUnitAction(id: string) {
  return guard(async () => {
    await requirePermission("catalog.units");
    await deleteUnit(id);
    return ok({});
  });
}

export async function addConversionAction(raw: unknown) {
  return guard(async () => {
    await requirePermission("catalog.units");
    await addConversion(raw);
    return ok({});
  });
}

export async function deleteConversionAction(id: string) {
  return guard(async () => {
    await requirePermission("catalog.units");
    await deleteConversion(id);
    return ok({});
  });
}

// --- Adjustments ------------------------------------------------------------

export async function createAdjustmentAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("inventory.adjust");
    const result = await createAdjustment(user.id, raw);
    return ok(result);
  });
}

// --- Lookups used by filter UIs (server-rendered pages call service directly;
//     these actions exist for client dropdowns elsewhere e.g. POS) ----------

export async function stockSummaryAction() {
  return guard(async () => {
    await requirePermission("inventory.view");
    const { rows } = await listStock({ page: 1, pageSize: 1 });
    return ok(rows);
  });
}

export async function movementFeedAction(productId?: string) {
  return guard(async () => {
    await requirePermission("inventory.movements");
    if (!productId) return fail("VALIDATION_ERROR", "productId required");
    const { rows } = await listMovements({ productId, page: 1 });
    return ok(rows.slice(0, 10));
  });
}

