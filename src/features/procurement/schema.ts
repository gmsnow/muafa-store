import { z } from "zod";

const moneyField = z.coerce.number().min(0).max(999_999_999_999);
const qtyField = z.coerce.number().positive().max(999_999_999);

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal("")),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  creditLimit: moneyField.default(0),
  paymentTerms: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const poItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: qtyField,
  unitCost: moneyField,
  discount: moneyField.optional(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  expectedDate: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(poItemSchema).min(1).max(200),
});

export const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: qtyField,
  unitCost: moneyField,
  discount: moneyField.optional(),
  batchNo: z.string().trim().max(80).optional().or(z.literal("")),
  mfgDate: z.string().optional().or(z.literal("")),
  expDate: z.string().optional().or(z.literal("")),
});

/** GRN payload: direct purchase or receiving against a purchase order. */
export const receiveSchema = z.object({
  supplierId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional().or(z.literal("")),
  paidAmount: moneyField.default(0),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  items: z.array(purchaseItemSchema).min(1).max(200),
});

export const payPurchaseSchema = z.object({
  purchaseId: z.string().uuid(),
  amount: moneyField.refine((v) => v > 0, "Amount must be positive"),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "WALLET"]),
  reference: z.string().trim().max(120).optional().or(z.literal("")),
});

export const purchaseReturnItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: qtyField,
  unitCost: moneyField,
});

export const purchaseReturnSchema = z.object({
  purchaseId: z.string().uuid(),
  reason: z.string().trim().min(3).max(300),
  refundMethod: z.enum(["CASH", "CREDIT"]).default("CASH"),
  items: z.array(purchaseReturnItemSchema).min(1),
});

export type SupplierInput = z.infer<typeof supplierSchema>;
export type PurchaseOrderInput = z.infer<typeof purchaseOrderSchema>;
export type ReceiveInput = z.infer<typeof receiveSchema>;
export type PayPurchaseInput = z.infer<typeof payPurchaseSchema>;
export type PurchaseReturnInput = z.infer<typeof purchaseReturnSchema>;
