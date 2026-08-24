"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { Dictionary } from "@/shared/i18n";
import { getProductForEditAction } from "../actions";
import { ProductFormDialog, type Option } from "./product-form";

interface EditableProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  nameAr: string | null;
  description: string | null;
  categoryId: string;
  brandId: string | null;
  unitId: string;
  costPrice: string;
  sellingPrice: string;
  wholesalePrice: string | null;
  minPrice: string | null;
  minStock: string;
  maxStock: string | null;
  reorderLevel: string;
  defaultSupplierId: string | null;
  trackBatches: boolean;
  trackExpiry: boolean;
  isActive: boolean;
  expiryDate?: string | null;
}

/**
 * Fetches the full product record on demand, then opens the shared form dialog
 * in controlled mode — avoids shipping every optional field in list payloads.
 */
export function ProductEditDialog({
  t, tCommon, tErrors, categories, productId,
}: {
  t: Dictionary["products"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  categories: Option[];
  productId: string;
}) {
  const [product, setProduct] = useState<EditableProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function openAndLoad() {
    setOpen(true);
    if (!product) {
      setLoading(true);
      const res = await getProductForEditAction(productId);
      setLoading(false);
      if (res.ok) setProduct(res.data as unknown as EditableProduct);
      else setOpen(false);
    }
  }

  function handleClose(v: boolean) {
    setOpen(v);
    if (!v) setProduct(null); // fresh fetch next time
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => void openAndLoad()} disabled={loading}>
        {loading ? <Loader2 className="size-3 animate-spin" /> : tCommon.edit}
      </Button>
      {product && (
        <ProductFormDialog
          t={t} tCommon={tCommon} tErrors={tErrors}
          categories={categories}
          open={open}
          onOpenChange={handleClose}
          product={{
            id: product.id,
            values: {
              sku: product.sku, barcode: product.barcode ?? "",
              name: product.name, nameAr: product.nameAr ?? "", description: product.description ?? "",
              categoryId: product.categoryId, brandId: product.brandId ?? "", unitId: product.unitId,
              costPrice: Number(product.costPrice), sellingPrice: Number(product.sellingPrice),
              wholesalePrice: product.wholesalePrice ? Number(product.wholesalePrice) : undefined,
              minPrice: product.minPrice ? Number(product.minPrice) : undefined,
              minStock: Number(product.minStock),
              maxStock: product.maxStock ? Number(product.maxStock) : undefined,
              reorderLevel: Number(product.reorderLevel),
              defaultSupplierId: product.defaultSupplierId ?? "",
              trackBatches: product.trackBatches, trackExpiry: product.trackExpiry,
              isActive: product.isActive,
              expiryDate: product.expiryDate ?? "",
            },
          }}
        />
      )}
    </>
  );
}
