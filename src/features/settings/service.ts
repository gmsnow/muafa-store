import "server-only";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import {
  storeSettingsSchema, salesSettingsSchema, inventorySettingsSchema,
  localizationSettingsSchema, securitySettingsSchema,
} from "./schema";

export async function getStoreSettings() {
  return db.storeSettings.upsert({
    where: { id: "store" },
    update: {},
    create: { id: "store", name: "Grocery Store" },
  });
}

export async function getSystemSettings() {
  return db.systemSettings.upsert({
    where: { id: "system" },
    update: {},
    create: { id: "system" },
  });
}

async function auditSettings(userId: string, entity: string, changes: { section: string }) {
  const { recordAudit } = await import("@/shared/core/audit");
  await recordAudit(db, {
    userId,
    action: "SETTINGS_UPDATE",
    entityType: entity,
    entityId: entity,
    newValues: changes,
  });
}

export async function saveStoreSettings(userId: string, raw: unknown) {
  const data = storeSettingsSchema.parse(raw);
  if (data.name.trim().length === 0) throw new AppError("VALIDATION_ERROR", "Store name is required");
  const payload = {
    name: data.name,
    nameAr: data.nameAr || null,
    logoUrl: data.logoUrl || null,
    address: data.address || null,
    addressAr: data.addressAr || null,
    phone: data.phone || null,
    email: data.email || null,
    currencyCode: data.currencyCode.toUpperCase(),
    currencySymbol: data.currencySymbol,
    receiptFooter: data.receiptFooter || null,
  };
  const saved = db.storeSettings.upsert({
    where: { id: "store" },
    update: payload,
    create: { id: "store", ...payload },
  });
  await auditSettings(userId, "StoreSettings", { section: "store" });
  return saved;
}

export async function saveSalesSettings(userId: string, raw: unknown) {
  const data = salesSettingsSchema.parse(raw);
  const saved = db.systemSettings.upsert({
    where: { id: "system" },
    update: { invoicePrefix: data.invoicePrefix },
    create: { id: "system", invoicePrefix: data.invoicePrefix },
  });
  await auditSettings(userId, "SystemSettings", { section: "sales" });
  return saved;
}

export async function saveInventorySettings(userId: string, raw: unknown) {
  const data = inventorySettingsSchema.parse(raw);
  const saved = db.systemSettings.upsert({
    where: { id: "system" },
    update: {
      lowStockThresholdDays: data.lowStockThresholdDays,
      expirationWarningDays: data.expirationWarningDays,
      batchTrackingEnabled: data.batchTrackingEnabled,
    },
    create: {
      id: "system",
      lowStockThresholdDays: data.lowStockThresholdDays,
      expirationWarningDays: data.expirationWarningDays,
      batchTrackingEnabled: data.batchTrackingEnabled,
    },
  });
  await auditSettings(userId, "SystemSettings", { section: "inventory" });
  return saved;
}

export async function saveLocalizationSettings(userId: string, raw: unknown) {
  const data = localizationSettingsSchema.parse(raw);
  const saved = db.systemSettings.upsert({
    where: { id: "system" },
    update: { language: "ar", dateFormat: data.dateFormat, timezone: data.timezone },
    create: { id: "system", language: "ar", dateFormat: data.dateFormat, timezone: data.timezone },
  });
  await auditSettings(userId, "SystemSettings", { section: "localization" });
  return saved;
}

export async function saveSecuritySettings(userId: string, raw: unknown) {
  const data = securitySettingsSchema.parse(raw);
  const saved = db.systemSettings.upsert({
    where: { id: "system" },
    update: {
      passwordMinLength: data.passwordMinLength,
      sessionTimeoutMinutes: data.sessionTimeoutMinutes,
      maxLoginAttempts: data.maxLoginAttempts,
      lockoutMinutes: data.lockoutMinutes,
    },
    create: {
      id: "system",
      passwordMinLength: data.passwordMinLength,
      sessionTimeoutMinutes: data.sessionTimeoutMinutes,
      maxLoginAttempts: data.maxLoginAttempts,
      lockoutMinutes: data.lockoutMinutes,
    },
  });
  await auditSettings(userId, "SystemSettings", { section: "security" });
  return saved;
}
