import { z } from "zod";

const moneyField = z.coerce.number().min(0).max(999_999_999_999);

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  groupId: z.string().uuid().optional().or(z.literal("")),
  creditLimit: moneyField.default(0),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const customerGroupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().max(80).optional().or(z.literal("")),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  discountRate: z.coerce.number().min(0).max(100).default(0),
  priceMode: z.enum(["retail", "wholesale"]).default("retail"),
});

/** PAYMENT reduces balance; DEBT/ADJUSTMENT raises it (signed at call site). */
export const customerTxnSchema = z.object({
  customerId: z.string().uuid(),
  type: z.enum(["PAYMENT", "DEBT", "ADJUSTMENT"]),
  amount: moneyField.refine((v) => v > 0, "Amount must be positive"),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export const loyaltyAdjustSchema = z.object({
  customerId: z.string().uuid(),
  mode: z.enum(["REDEEM", "ADJUST"]),
  points: z.coerce.number(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerGroupInput = z.infer<typeof customerGroupSchema>;
export type CustomerTxnInput = z.infer<typeof customerTxnSchema>;
export type LoyaltyAdjustInput = z.infer<typeof loyaltyAdjustSchema>;
