import { z } from "zod";

const moneyField = z.coerce.number().min(0).max(999_999_999_999);
const qtyField = z.coerce.number().positive().max(999_999_999);

// ---------------------------------------------------------------------------
// POS checkout (F2)
// ---------------------------------------------------------------------------

export const checkoutItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: qtyField,
  /** Line-level discount in absolute money (optional). */
  discount: moneyField.optional(),
});
export type CheckoutItem = z.infer<typeof checkoutItemSchema>;

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1).max(200),
  customerId: z.string().uuid().optional().or(z.literal("")),
  invoiceDiscount: moneyField.default(0),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "WALLET", "CREDIT"]),
        amount: moneyField,
        reference: z.string().trim().max(120).optional(),
      }),
    )
    .max(5)
    .default([]),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export interface CheckoutPayment {
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "WALLET" | "CREDIT";
  amount: number;
  reference?: string;
}

// ---------------------------------------------------------------------------
// Cancel + returns (F3)
// ---------------------------------------------------------------------------

export const cancelSaleSchema = z.object({ saleId: z.string().uuid() });

export const saleReturnItemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: qtyField,
});
export type SaleReturnItemInput = z.infer<typeof saleReturnItemSchema>;

export const saleReturnSchema = z.object({
  saleId: z.string().uuid(),
  items: z.array(saleReturnItemSchema).min(1),
  reason: z.string().trim().min(3).max(300),
  restock: z.boolean().default(true),
  refundMethod: z.enum(["CASH", "CREDIT"]).default("CASH"),
});
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;

export interface SalesQuery {
  q?: string;
  status?: string;
  cashierId?: string;
  from?: string;
  to?: string;
  page?: number;
}
