import "server-only";
import Decimal from "decimal.js";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { D, money, qty as q3 } from "@/shared/core/money";
import {
  categorySchema, brandSchema, unitSchema, conversionSchema, cleanProduct,
  productSchema, importRowSchema, adjustmentSchema,
  type ProductQuery,
} from "./schema";
import { Prisma, type MovementType } from "@/generated/prisma/client";
import type { ProductBatch } from "@/generated/prisma/client";

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const productCard = {
  id: true, sku: true, barcode: true, name: true, nameAr: true, isActive: true,
  costPrice: true, sellingPrice: true, wholesalePrice: true,
  minStock: true, reorderLevel: true,
  trackBatches: true, trackExpiry: true,
  category: { select: { name: true, nameAr: true } },
  brand: { select: { name: true, nameAr: true } },
  unit: { select: { symbol: true, name: true, nameAr: true } },
  inventory: { select: { quantity: true } },
} satisfies Prisma.ProductSelect;

export type ProductCard = Prisma.ProductGetPayload<{ select: typeof productCard }>;

export async function listProducts(query: ProductQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  // Numeric queries match prices/stock exactly; text queries match names/category.
  const qNumber = query.q !== undefined && query.q.trim() !== "" ? Number(query.q) : NaN;
  const numeric = Number.isFinite(qNumber) ? qNumber : null;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(query.status === "active" ? { isActive: true } : query.status === "inactive" ? { isActive: false } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { nameAr: { contains: query.q } },
            { sku: { contains: query.q, mode: "insensitive" } },
            { barcode: { contains: query.q } },
            {
              category: {
                OR: [
                  { name: { contains: query.q, mode: "insensitive" } },
                  { nameAr: { contains: query.q } },
                ],
              },
            },
            ...(numeric === null
              ? []
              : [
                  { costPrice: numeric },
                  { sellingPrice: numeric },
                  { wholesalePrice: numeric },
                  { inventory: { quantity: numeric } },
                ]),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      select: productCard,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

export async function getProductForEdit(id: string) {
  const product = await db.product.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
      defaultSupplier: { select: { id: true, name: true } },
      batches: {
        where: { expiryDate: { not: null } },
        orderBy: { expiryDate: "asc" },
        take: 1,
        select: { expiryDate: true },
      },
    },
  });
  if (!product) throw new AppError("NOT_FOUND", "Product not found");
  const expiry = product.batches[0]?.expiryDate ?? null;
  return { ...product, expiryDate: expiry ? expiry.toISOString().slice(0, 10) : null };
}

async function nextSku(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.product.findFirst({
    where: { sku: { startsWith: "SKU-" } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const n = last ? Number.parseInt(last.sku.slice(4), 10) || 0 : 0;
  return `SKU-${String(n + 1).padStart(4, "0")}`;
}

async function assertSkuFree(sku: string, excludeId?: string) {
  const clash = await db.product.findFirst({
    where: { sku, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError("DUPLICATE", `SKU ${sku} already exists`);
}

async function assertBarcodeFree(barcode: string | undefined, excludeId?: string) {
  if (!barcode) return;
  const clash = await db.product.findFirst({
    where: { barcode, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new AppError("DUPLICATE", `Barcode ${barcode} already exists`);
}

function priceData(input: ReturnType<typeof cleanProduct>): Omit<Prisma.ProductUncheckedCreateInput, "sku" | "unitId"> {
  const { sku: _sku, unitId: _unitId, initialQty: _initialQty, expiryDate: _expiryDate, ...rest } = input;
  void _sku; void _unitId; void _initialQty; void _expiryDate;
  return {
    ...rest,
    costPrice: money(input.costPrice).toString(),
    sellingPrice: money(input.sellingPrice).toString(),
    wholesalePrice: input.wholesalePrice !== undefined ? money(input.wholesalePrice).toString() : null,
    minPrice: input.minPrice !== undefined ? money(input.minPrice).toString() : null,
    minStock: q3(input.minStock).toString(),
    maxStock: input.maxStock !== undefined ? q3(input.maxStock).toString() : null,
    reorderLevel: q3(input.reorderLevel).toString(),
  };
}

/** Products created without a unit fall back to the base unit (e.g. "Piece"). */
async function resolveUnitId(tx: Prisma.TransactionClient, unitId?: string): Promise<string> {
  if (unitId) return unitId;
  const base = await tx.unit.findFirst({ where: { isBase: true }, select: { id: true } });
  if (base) return base.id;
  // No base flag set — use any existing unit before failing.
  const any = await tx.unit.findFirst({ select: { id: true } });
  if (any) return any.id;
  // Units table is empty (no management UI) — bootstrap the default unit.
  const created = await tx.unit.create({ data: { name: "Piece", nameAr: "حبة", symbol: "pcs", isBase: true } });
  return created.id;
}

/** Parse a form date string ("YYYY-MM-DD"); returns null when absent or invalid. */
function parseExpiry(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createProduct(userId: string, raw: unknown): Promise<ProductCard> {
  const input = cleanProduct(productSchema.parse(raw));
  if (input.sellingPrice < input.costPrice) {
    throw new AppError("VALIDATION_ERROR", "Selling price below cost", {
      sellingPrice: ["must be ≥ cost price"],
    });
  }
  return db.$transaction(async (tx) => {
    const sku = input.sku ?? (await nextSku(tx));
    await assertSkuFree(sku);
    await assertBarcodeFree(input.barcode);
    const unitId = await resolveUnitId(tx, input.unitId);
    const expiry = parseExpiry(input.expiryDate);
    const product = await tx.product.create({
      data: { ...priceData(input), sku, unitId, ...(expiry ? { trackExpiry: true } : {}) },
    });
    // Every product gets an inventory row — later changes move via movements.
    await tx.inventory.create({
      data: { productId: product.id, quantity: q3(input.initialQty ?? 0).toString() },
    });
    if (expiry) {
      await tx.productBatch.create({
        data: {
          productId: product.id,
          batchNo: `INIT-${Date.now().toString(36).toUpperCase()}`,
          expiryDate: expiry,
          quantity: q3(input.initialQty ?? 0).toString(),
          costPrice: money(input.costPrice).toString(),
        },
      });
    }
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, select: productCard }) as Promise<ProductCard>;
  }, { isolationLevel: "Serializable" }).then(async (card) => {
    await recordProductAudit(userId, "PRODUCT_CREATE", card.id);
    return card;
  });
}

export async function updateProduct(userId: string, id: string, raw: unknown): Promise<ProductCard> {
  const input = cleanProduct(productSchema.parse(raw));
  const existing = await db.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) throw new AppError("NOT_FOUND", "Product not found");
  return db.$transaction(async (tx) => {
    const sku = input.sku ?? undefined;
    if (sku) await assertSkuFree(sku, id);
    await assertBarcodeFree(input.barcode, id);
    const expiry = parseExpiry(input.expiryDate);
    await tx.product.update({
      where: { id },
      data: {
        ...priceData(input),
        ...(sku ? { sku } : {}),
        ...(input.unitId ? { unitId: input.unitId } : {}),
        ...(input.expiryDate !== undefined && expiry ? { trackExpiry: true } : {}),
      },
    });
    if (input.expiryDate !== undefined) {
      // Apply the edited date across the product's batches (single-stock model).
      const batchCount = await tx.productBatch.count({ where: { productId: id } });
      if (batchCount === 0) {
        if (expiry) {
          await tx.productBatch.create({
            data: {
              productId: id,
              batchNo: `INIT-${Date.now().toString(36).toUpperCase()}`,
              expiryDate: expiry,
              quantity: "0",
              costPrice: money(input.costPrice).toString(),
            },
          });
        }
      } else {
        await tx.productBatch.updateMany({ where: { productId: id }, data: { expiryDate: expiry } });
      }
    }
    return tx.product.findUniqueOrThrow({ where: { id }, select: productCard }) as Promise<ProductCard>;
  }).then(async (card) => {
    await recordProductAudit(userId, "PRODUCT_UPDATE", id);
    return card;
  });
}

/** Soft delete — financial history stays intact (spec §20). */
export async function softDeleteProduct(userId: string, id: string) {
  const inUse = await db.saleItem.findFirst({ where: { productId: id }, select: { id: true } });
  if (inUse) throw new AppError("IN_USE", "Product has sales history and cannot be deleted");
  const count = await db.product.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
  if (count.count === 0) throw new AppError("NOT_FOUND", "Product not found");
  await recordProductAudit(userId, "PRODUCT_DELETE", id);
}

// ---------------------------------------------------------------------------
// CSV import / export (spec §12)
// ---------------------------------------------------------------------------

export interface ImportReport {
  totalRows: number;
  imported: number;
  errors: { row: number; message: string }[];
}

export async function importProductsCsv(userId: string, csvText: string): Promise<ImportReport> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new AppError("VALIDATION_ERROR", "File is empty");
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ["name", "category", "unit", "costprice", "sellingprice"];
  const missing = required.filter((r) => !header.includes(r.toLowerCase()));
  if (missing.length > 0) {
    throw new AppError("VALIDATION_ERROR", `Missing columns: ${missing.join(", ")}`);
  }

  const report: ImportReport = { totalRows: lines.length - 1, imported: 0, errors: [] };

  const [categories, brands, units] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true } }),
    db.brand.findMany({ select: { id: true, name: true } }),
    db.unit.findMany({ select: { id: true, name: true, isBase: true } }),
  ]);
  const catMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const brandMap = new Map(brands.map((b) => [b.name.toLowerCase(), b.id]));
  const unitMap = new Map(units.map((u) => [u.name.toLowerCase(), u.id]));
  const fallbackUnit = units.find((u) => u.isBase)?.id;

  for (let i = 1; i < lines.length; i++) {
    try {
      const cells = splitCsvLine(lines[i]);
      const obj: Record<string, string> = {};
      header.forEach((h, idx) => { obj[h] = (cells[idx] ?? "").trim(); });
      const parsed = importRowSchema.parse(obj);

      const categoryId = catMap.get(parsed.category.toLowerCase());
      if (!categoryId) throw new Error(`Unknown category "${parsed.category}"`);
      let unitId = unitMap.get(parsed.unit.toLowerCase());
      if (!unitId && fallbackUnit) unitId = fallbackUnit;
      else if (!unitId) throw new Error(`Unknown unit "${parsed.unit}"`);
      const brandId = parsed.brand ? brandMap.get(parsed.brand.toLowerCase()) : undefined;

      const created = await createProduct(userId, {
        sku: parsed.sku,
        barcode: parsed.barcode,
        name: parsed.name,
        nameAr: parsed.nameAr,
        categoryId,
        brandId: brandId ?? "",
        unitId,
        costPrice: parsed.costPrice,
        sellingPrice: parsed.sellingPrice,
        minStock: parsed.minStock,
      });
      if (created) report.imported++;
    } catch (err) {
      const message = err instanceof Error ? err.message.split("\n")[0] : "Invalid row";
      report.errors.push({ row: i + 1, message: message.slice(0, 200) });
    }
  }
  return report;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === "," || ch === ";") && !inQuotes) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export async function exportProductsCsv(): Promise<string> {
  const rows = await db.product.findMany({
    where: { deletedAt: null },
    select: {
      sku: true, barcode: true, name: true, nameAr: true,
      category: { select: { name: true } }, brand: { select: { name: true } },
      unit: { select: { name: true } },
      costPrice: true, sellingPrice: true, minStock: true,
      inventory: { select: { quantity: true } },
      isActive: true,
    },
    orderBy: { sku: "asc" },
  });
  const head = "sku,barcode,name,nameAr,category,brand,unit,costPrice,sellingPrice,minStock,stock,isActive";
  const body = rows.map((p) =>
    [
      p.sku, p.barcode ?? "", esc(p.name), esc(p.nameAr ?? ""), p.category.name,
      p.brand?.name ?? "", p.unit.name, p.costPrice, p.sellingPrice,
      p.minStock, p.inventory?.quantity ?? "0", p.isActive,
    ].join(","),
  );
  return [head, ...body].join("\n");
}

const esc = (s: string) => (/[",;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

async function recordProductAudit(userId: string, action: string, entityId: string) {
  const { recordAudit } = await import("@/shared/core/audit");
  await recordAudit(db, { userId, action, entityType: "Product", entityId });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories() {
  const categories = await db.category.findMany({
    include: {
      parent: { select: { name: true, nameAr: true } },
      _count: { select: { products: true, children: true } },
    },
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
  });
  return categories.sort((a, b) => {
    const an = a.parent?.name ?? a.name;
    const bn = b.parent?.name ?? b.name;
    return an.localeCompare(bn) || a.name.localeCompare(b.name);
  });
}

export async function saveCategory(id: string | null, raw: unknown) {
  const input = categorySchema.parse(raw);
  if (id !== null && input.parentId !== null && input.parentId === id) {
    throw new AppError("VALIDATION_ERROR", "Category cannot be its own parent");
  }
  if (id) {
    await ensureNoCycle(id, input.parentId ?? null);
    await db.category.update({ where: { id }, data: input });
  } else {
    const dup = await db.category.findFirst({
      where: { name: input.name, parentId: input.parentId ?? null }, select: { id: true },
    });
    if (dup) throw new AppError("DUPLICATE", "Category already exists at this level");
    await db.category.create({ data: input });
  }
}

async function ensureNoCycle(id: string, newParentId: string | null) {
  let cursor = newParentId;
  const seen = new Set<string>([id]);
  while (cursor) {
    if (seen.has(cursor)) throw new AppError("VALIDATION_ERROR", "Circular category nesting");
    seen.add(cursor);
    const parent = await db.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = parent?.parentId ?? null;
  }
}

export async function deleteCategory(id: string) {
  const [products, children] = await Promise.all([
    db.product.count({ where: { categoryId: id, deletedAt: null } }),
    db.category.count({ where: { parentId: id } }),
  ]);
  if (products > 0 || children > 0) {
    throw new AppError("IN_USE", "Category has products or subcategories");
  }
  await db.category.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export async function listBrands() {
  return db.brand.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
}

export async function saveBrand(id: string | null, raw: unknown) {
  const input = brandSchema.parse(raw);
  try {
    if (id) await db.brand.update({ where: { id }, data: input });
    else await db.brand.create({ data: input });
  } catch {
    throw new AppError("DUPLICATE", "Brand name already exists");
  }
}

export async function deleteBrand(id: string) {
  const products = await db.product.count({ where: { brandId: id, deletedAt: null } });
  if (products > 0) throw new AppError("IN_USE", "Brand has products assigned");
  await db.brand.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Units & conversions
// ---------------------------------------------------------------------------

export async function listUnits() {
  return db.unit.findMany({
    include: {
      _count: { select: { products: true } },
      conversionsFrom: { include: { toUnit: { select: { name: true, nameAr: true, symbol: true } } } },
    },
    orderBy: [{ isBase: "desc" }, { name: "asc" }],
  });
}

export async function saveUnit(id: string | null, raw: unknown) {
  const input = unitSchema.parse(raw);
  try {
    if (id) await db.unit.update({ where: { id }, data: input });
    else await db.unit.create({ data: input });
  } catch {
    throw new AppError("DUPLICATE", "Unit name already exists");
  }
}

export async function deleteUnit(id: string) {
  const products = await db.product.count({ where: { unitId: id, deletedAt: null } });
  if (products > 0) throw new AppError("IN_USE", "Unit has products assigned");
  await db.unit.delete({ where: { id } });
}

export async function addConversion(raw: unknown) {
  const input = conversionSchema.parse(raw);
  try {
    await db.unitConversion.create({
      data: { fromUnitId: input.fromUnitId, toUnitId: input.toUnitId, factor: String(input.factor) },
    });
  } catch {
    throw new AppError("DUPLICATE", "Conversion already defined for this pair");
  }
}

export async function deleteConversion(id: string) {
  await db.unitConversion.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Stock levels / low stock / expiring
// ---------------------------------------------------------------------------

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  nameAr: string | null;
  categoryName: string;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  stockValue: number;
}

export async function listStock(query: { q?: string; categoryId?: string; page?: number; pageSize?: number }) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const where: Prisma.ProductWhereInput = {
    deletedAt: null, isActive: true,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { nameAr: { contains: query.q } },
            { sku: { contains: query.q, mode: "insensitive" } },
            { barcode: { contains: query.q } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.product.findMany({
      where,
      select: {
        id: true, sku: true, name: true, nameAr: true,
        costPrice: true, sellingPrice: true,
        category: { select: { name: true, nameAr: true } },
        inventory: { select: { quantity: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
  ]);

  // Stock value is calculated from product data: quantity × product cost price.
  const stockRows: StockRow[] = rows.map((p) => {
    const quantity = D(p.inventory?.quantity).toNumber();
    const costPrice = money(p.costPrice).toNumber();
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      nameAr: p.nameAr,
      categoryName: p.category.nameAr ?? p.category.name,
      quantity,
      costPrice,
      sellingPrice: money(p.sellingPrice).toNumber(),
      stockValue: q3(quantity).mul(money(costPrice)).toDecimalPlaces(2).toNumber(),
    };
  });
  const totalValue = stockRows.reduce((a, r) => a + r.stockValue, 0);
  return { rows: stockRows, total, page, pageSize, totalValue };
}

export interface LowStockItem {
  productId: string;
  sku: string;
  name: string;
  nameAr: string | null;
  quantity: number;
  minStock: number;
  reorderLevel: number;
}

export async function listLowStock(limit?: number): Promise<LowStockItem[]> {
  // Filter/sort in SQL — was a full-catalog fetch filtered and sorted in JS.
  const statement = Prisma.sql`
    SELECT p.id, p.sku, p.name, p."nameAr" AS "nameAr",
           p."minStock" AS "minStock", p."reorderLevel" AS "reorderLevel",
           i.quantity AS quantity
    FROM products p
    LEFT JOIN inventory i ON i."productId" = p.id
    WHERE p."deletedAt" IS NULL AND p."isActive" = true
      AND COALESCE(i.quantity, 0) <= GREATEST(p."minStock", p."reorderLevel")
    ORDER BY COALESCE(i.quantity, 0) ASC
    ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}`;
  const rows = await db.$queryRaw<
    { id: string; sku: string; name: string; nameAr: string | null;
      minStock: string; reorderLevel: string; quantity: string | null }[]
  >(statement);
  return rows.map((p) => ({
    productId: p.id,
    sku: p.sku,
    name: p.name,
    nameAr: p.nameAr,
    quantity: D(p.quantity ?? 0).toNumber(),
    minStock: D(p.minStock).toNumber(),
    reorderLevel: D(p.reorderLevel).toNumber(),
  }));
}

export interface ExpiringBatchItem {
  batchId: string;
  sku: string;
  name: string;
  nameAr: string | null;
  batchNo: string;
  expiryDate: Date | null;
  quantity: number;
  daysLeft: number | null;
}

export async function listExpiringBatches(withinDays?: number, limit?: number): Promise<ExpiringBatchItem[]> {
  const settings = await db.systemSettings.findUnique({ where: { id: "system" } });
  const days = withinDays ?? settings?.expirationWarningDays ?? 30;
  const to = new Date(Date.now() + days * 86400000);
  const batches = await db.productBatch.findMany({
    where: { expiryDate: { lte: to }, quantity: { gt: 0 }, product: { deletedAt: null, isActive: true } },
    orderBy: { expiryDate: "asc" },
    // Hard safety ceiling so an unbounded caller can't scan the whole table.
    take: limit ? limit + 20 : 500,
    include: { product: { select: { sku: true, name: true, nameAr: true } } },
  });
  const items = batches.map((b) => mapBatch(b));
  return limit ? items.slice(0, limit) : items;
}

function mapBatch(b: ProductBatch & { product: { sku: string; name: string; nameAr: string | null } }): ExpiringBatchItem {
  return {
    batchId: b.id,
    sku: b.product.sku,
    name: b.product.name,
    nameAr: b.product.nameAr,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    quantity: D(b.quantity).toNumber(),
    daysLeft: b.expiryDate ? Math.ceil((b.expiryDate.getTime() - Date.now()) / 86400000) : null,
  };
}

// ---------------------------------------------------------------------------
// Movements (immutable audit trail of every stock delta)
// ---------------------------------------------------------------------------

export async function listMovements(query: { q?: string; productId?: string; type?: string; from?: string; to?: string; page?: number }) {
  const page = query.page ?? 1;
  const pageSize = 30;

  // SKU/name search resolves to matching product ids first
  let productIds: string[] | undefined;
  if (query.q) {
    const products = await db.product.findMany({
      where: {
        OR: [
          { sku: { contains: query.q, mode: "insensitive" } },
          { name: { contains: query.q, mode: "insensitive" } },
          { nameAr: { contains: query.q } },
          { barcode: { contains: query.q } },
        ],
      },
      select: { id: true },
      take: 100,
    });
    productIds = products.map((p) => p.id);
    if (productIds.length === 0) return { rows: [], total: 0, page, pageSize };
  }

  const where: Prisma.InventoryMovementWhereInput = {
    ...(query.productId ? { productId: query.productId } : productIds ? { productId: { in: productIds } } : {}),
    ...(query.type && query.type !== "all"
      ? { type: query.type.toUpperCase().replace("-", "_") as MovementType }
      : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(`${query.to}T23:59:59`) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.inventoryMovement.findMany({
      where,
      include: {
        product: { select: { sku: true, name: true, nameAr: true } },
        user: { select: { username: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inventoryMovement.count({ where }),
  ]);
  return { rows, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// Stock adjustments (F6) — the ONLY sanctioned manual stock mutation path.
// Invariant: every delta produces exactly one InventoryMovement inside the txn.
// ---------------------------------------------------------------------------

export async function listAdjustments(page = 1, pageSize = 25) {
  const [rows, total] = await Promise.all([
    db.stockAdjustment.findMany({
      include: {
        product: { select: { sku: true, name: true, nameAr: true } },
        user: { select: { username: true, fullName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.stockAdjustment.count(),
  ]);
  return { rows, total, page, pageSize };
}

async function nextAdjustmentNumber(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.stockAdjustment.findFirst({
    orderBy: { adjustmentNumber: "desc" },
    select: { adjustmentNumber: true },
  });
  const n = last ? Number.parseInt(last.adjustmentNumber.replace("ADJ-", ""), 10) || 0 : 0;
  return `ADJ-${String(n + 1).padStart(6, "0")}`;
}

/**
 * Creates StockAdjustment + InventoryMovement + updates Inventory atomically.
 * Batch-tracked products: DECREASE consumes FEFO batches; INCREASE creates an
 * "ADJ-<number>" batch so quantities stay reconcilable per-batch.
 */
export async function createAdjustment(
  userId: string,
  raw: unknown,
): Promise<{ adjustmentNumber: string }> {
  const input = adjustmentSchema.parse(raw);
  const delta = input.type === "INCREASE" ? input.quantity : -input.quantity;

  return db.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true, trackBatches: true, trackExpiry: true },
    });
    if (!product) throw new AppError("NOT_FOUND", "Product not found");

    const inv = await tx.inventory.findUnique({ where: { productId: product.id } });
    const previousQuantity = D(inv?.quantity).toNumber();
    const newQuantity = q3(previousQuantity + delta).toNumber();
    if (newQuantity < 0) {
      throw new AppError("INSUFFICIENT_STOCK", "Adjustment would drive stock negative");
    }

    const movementType: MovementType = input.type === "INCREASE" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";

    // Batch handling
    let batchId: string | null = null;
    if (product.trackBatches) {
      if (input.type === "DECREASE") {
        const batches = await tx.productBatch.findMany({
          where: { productId: product.id, quantity: { gt: 0 } },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        });
        let remaining = q3(input.quantity);
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
          throw new AppError("INSUFFICIENT_STOCK", "Batch quantities do not cover the decrease");
        }
      } else {
        const adjBatch = await tx.productBatch.create({
          data: {
            productId: product.id,
            batchNo: `ADJ-${Date.now().toString(36).toUpperCase()}`,
            quantity: q3(input.quantity).toString(),
            costPrice: "0",
          },
        });
        batchId = adjBatch.id;
      }
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: product.id,
        batchId,
        type: movementType,
        quantity: delta.toFixed(3),
        refType: "StockAdjustment",
        note: `${input.reason}${input.note ? ` — ${input.note}` : ""}`,
        userId,
      },
    });

    const adjustmentNumber = await nextAdjustmentNumber(tx);
    await tx.stockAdjustment.create({
      data: {
        adjustmentNumber,
        productId: product.id,
        type: input.type,
        quantity: q3(input.quantity).toString(),
        previousQuantity: previousQuantity.toFixed(3),
        newQuantity: newQuantity.toFixed(3),
        reason: input.reason,
        note: input.note?.trim() || null,
        movementId: movement.id,
        userId,
      },
    });

    await tx.inventory.update({
      where: { productId: product.id },
      data: { quantity: newQuantity.toFixed(3) },
    });

    return { adjustmentNumber };
  }, { isolationLevel: "Serializable" }).then(async (result) => {
    const { recordAudit } = await import("@/shared/core/audit");
    await recordAudit(db, {
      userId, action: "STOCK_ADJUSTMENT", entityType: "StockAdjustment",
      entityId: result.adjustmentNumber,
      newValues: { reason: input.reason, type: input.type, quantity: input.quantity },
    });
    return result;
  });
}




