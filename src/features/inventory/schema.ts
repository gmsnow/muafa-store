import { z } from "zod";

// ---------------------------------------------------------------------------
// Catalog: categories / brands / units
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(500).optional().nullable(),
});
export type BrandInput = z.infer<typeof brandSchema>;

export const unitSchema = z.object({
  name: z.string().trim().min(1).max(60),
  nameAr: z.string().trim().max(60).optional().nullable(),
  symbol: z.string().trim().max(16).optional().nullable(),
  isBase: z.boolean().default(false),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const conversionSchema = z
  .object({
    fromUnitId: z.string().uuid(),
    toUnitId: z.string().uuid(),
    factor: z.coerce.number().positive().max(1_000_000),
  })
  .refine((v) => v.fromUnitId !== v.toUnitId, { message: "Units must differ", path: ["toUnitId"] });
export type ConversionInput = z.infer<typeof conversionSchema>;

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

const money = z.coerce.number().min(0).max(999_999_999_999);
const quantity = z.coerce.number().min(0).max(999_999_999);

export const productSchema = z.object({
  sku: z.string().trim().max(64).optional().or(z.literal("")),
  barcode: z.string().trim().max(64).optional().or(z.literal("")),
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().optional().or(z.literal("")),
  unitId: z.string().uuid().optional().or(z.literal("")),
  costPrice: money,
  sellingPrice: money,
  wholesalePrice: money.optional(),
  minPrice: money.optional(),
  initialQty: quantity.optional(),
  expiryDate: z.string().trim().max(40).optional().or(z.literal("")),
  minStock: quantity.default(0),
  maxStock: quantity.optional(),
  reorderLevel: quantity.default(0),
  defaultSupplierId: z.string().uuid().optional().or(z.literal("")),
  trackBatches: z.boolean().default(false),
  trackExpiry: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;

/** Normalize "" → undefined so optional fields map to null in Prisma. */
export function cleanProduct(input: ProductInput) {
  return {
    ...input,
    sku: input.sku?.trim() || undefined,
    barcode: input.barcode?.trim() || undefined,
    nameAr: input.nameAr?.trim() || undefined,
    description: input.description?.trim() || undefined,
    brandId: input.brandId?.trim() || undefined,
    wholesalePrice: input.wholesalePrice ?? undefined,
    minPrice: input.minPrice ?? undefined,
    maxStock: input.maxStock ?? undefined,
    defaultSupplierId: input.defaultSupplierId?.trim() || undefined,
  };
}

export interface ProductQuery {
  q?: string;
  categoryId?: string;
  brandId?: string;
  status?: "active" | "inactive" | "all";
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// CSV import row (spec §12): sku,name,nameAr,category,brand,unit,costPrice,sellingPrice,minStock,barcode
// ---------------------------------------------------------------------------

export const importRowSchema = z.object({
  sku: z.string().trim().min(1),
  name: z.string().trim().min(1),
  nameAr: z.string().trim().optional(),
  category: z.string().trim().min(1),
  brand: z.string().trim().optional(),
  unit: z.string().trim().min(1),
  costPrice: money,
  sellingPrice: money,
  minStock: quantity.default(0),
  barcode: z.string().trim().optional(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

// ---------------------------------------------------------------------------
// Stock adjustments (F6)
// ---------------------------------------------------------------------------

export const adjustmentSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(["INCREASE", "DECREASE"]),
  quantity: z.coerce.number().positive().max(999_999_999),
  reason: z.string().trim().min(3).max(300),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export interface MovementQuery {
  productId?: string;
  type?: string;
  from?: string;
  to?: string;
  page?: number;
}
