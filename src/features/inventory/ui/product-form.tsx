"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { VoiceInput } from "@/components/voice-input";
import type { Dictionary } from "@/shared/i18n";
import { cleanProduct, productSchema } from "../schema";
import { createProductAction, updateProductAction } from "../actions";

export interface Option {
  id: string;
  name: string;
  nameAr?: string | null;
}

export interface ProductFormValues {
  sku?: string; barcode?: string; name: string; nameAr?: string; description?: string;
  categoryId: string; brandId?: string; unitId?: string;
  costPrice: number; sellingPrice: number;
  wholesalePrice?: number; minPrice?: number;
  initialQty?: number;
  expiryDate?: string;
  minStock: number; maxStock?: number; reorderLevel: number;
  defaultSupplierId?: string;
  trackBatches: boolean; trackExpiry: boolean; isActive: boolean;
}

interface Props {
  t: Dictionary["products"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  categories: Option[];
  product?: {
    id: string;
    values: Partial<ProductFormValues>;
  };
  trigger?: React.ReactNode;
  /** Controlled mode (used by ProductEditDialog). */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function ProductFormDialog({
  t, tCommon, tErrors, categories,
  product, trigger, open: openProp, onOpenChange,
}: Props) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setInternalOpen(v));

  // Arabic-only UI: the English name field is removed; the Arabic name is mirrored
  // into it during validation + save so the required canonical `name` column stays populated.
  const form = useForm({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: (async (values: any, ctx: any, opts: any) => {
      const v = values.nameAr?.trim() ? { ...values, name: values.nameAr.trim() } : values;
      return zodResolver(productSchema)(v, ctx, opts);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any,
    defaultValues: {
      sku: "", barcode: "", name: "", nameAr: "", description: "",
      categoryId: "", brandId: "", unitId: "",
      costPrice: 0, sellingPrice: 0, wholesalePrice: undefined, minPrice: undefined,
      initialQty: undefined, expiryDate: "",
      minStock: 0, maxStock: undefined, reorderLevel: 0,
      defaultSupplierId: "",
      trackBatches: false, trackExpiry: false, isActive: true,
      ...product?.values,
    },
  });

  async function onSubmit(values: ProductFormValues) {
    if (values.nameAr?.trim()) values.name = values.nameAr.trim();
    const payload = cleanProduct(productSchema.parse(values));
    const res = product
      ? await updateProductAction(product.id, payload)
      : await createProductAction(payload);
    if (res.ok) {
      toast.success(product ? t.updatedOk : t.createdOk);
      setOpen(false);
      form.reset();
      router.refresh();
    } else {
      const msg = res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message;
      toast.error(msg);
      if (res.error.fields) {
        for (const [key, messages] of Object.entries(res.error.fields)) {
          form.setError(key as keyof ProductFormValues, { message: messages[0] });
        }
      }
    }
  }

  const err = (key: keyof ProductFormValues) => form.formState.errors[key]?.message;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm">
              <Plus className="size-4" /> {t.addProduct}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? t.editProduct : t.addProduct}</DialogTitle>
          {!product && <DialogDescription>{t.deleteWarning}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Field label={t.nameAr} error={err("nameAr") || err("name")} full>
            <VoiceInput {...form.register("nameAr")} dir="rtl" required />
          </Field>

          <Field label={t.category} error={err("categoryId")}>
            <Select value={form.watch("categoryId")} onValueChange={(v) => form.setValue("categoryId", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nameAr || c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!product && (
            <Field label={t.currentStock}>
              <Input type="number" step="0.001" min="0" dir="ltr" {...form.register("initialQty")} />
            </Field>
          )}
          <Field label={t.expiryDate}>
            <Input type="date" dir="ltr" {...form.register("expiryDate")} />
          </Field>

          <Field label={t.costPrice} error={err("costPrice")}>
            <Input type="number" step="0.01" min="0" dir="ltr" {...form.register("costPrice")} />
          </Field>
          <Field label={t.sellingPrice} error={err("sellingPrice")}>
            <Input type="number" step="0.01" min="0" dir="ltr" {...form.register("sellingPrice")} />
          </Field>
          <Field label={t.wholesalePrice}>
            <Input type="number" step="0.01" min="0" dir="ltr" {...form.register("wholesalePrice")} />
          </Field>

          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tCommon.cancel}</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {tCommon.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, error, children, hint, full,
}: { label: string; error?: string; children: React.ReactNode; hint?: string; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label>{label}{hint && <span className="ms-1 text-[10px] text-muted-foreground">{hint}</span>}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
