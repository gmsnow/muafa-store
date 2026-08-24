import { z } from "zod";

export const storeSettingsSchema = z.object({
  name: z.string().trim().min(1).max(150),
  nameAr: z.string().trim().max(150).optional().or(z.literal("")),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  addressAr: z.string().trim().max(300).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.string().trim().email().max(150).optional().or(z.literal("")),
  currencyCode: z.string().trim().min(2).max(8),
  currencySymbol: z.string().trim().min(1).max(8),
  receiptFooter: z.string().trim().max(300).optional().or(z.literal("")),
});

export const salesSettingsSchema = z.object({
  invoicePrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z-]{1,8}$/, "1-8 letters/dashes")
    .transform((v) => v.toUpperCase()),
});

export const inventorySettingsSchema = z.object({
  lowStockThresholdDays: z.coerce.number().int().min(0).max(365),
  expirationWarningDays: z.coerce.number().int().min(1).max(365),
  batchTrackingEnabled: z.union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")]).transform((v) => v === "on" || v === "true"),
});

export const localizationSettingsSchema = z.object({
  dateFormat: z.enum(["yyyy-MM-dd", "dd/MM/yyyy", "MM/dd/yyyy"]),
  timezone: z.string().trim().min(1).max(60),
});

export const securitySettingsSchema = z.object({
  passwordMinLength: z.coerce.number().int().min(6).max(64),
  sessionTimeoutMinutes: z.coerce.number().int().min(15).max(10080),
  maxLoginAttempts: z.coerce.number().int().min(3).max(20),
  lockoutMinutes: z.coerce.number().int().min(1).max(1440),
});

export type StoreSettingsInput = z.infer<typeof storeSettingsSchema>;
export type SalesSettingsInput = z.infer<typeof salesSettingsSchema>;
export type InventorySettingsInput = z.infer<typeof inventorySettingsSchema>;
export type LocalizationSettingsInput = z.infer<typeof localizationSettingsSchema>;
export type SecuritySettingsInput = z.infer<typeof securitySettingsSchema>;
