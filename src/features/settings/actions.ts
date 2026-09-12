"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import {
  saveStoreSettings, saveSalesSettings, saveInventorySettings,
  saveLocalizationSettings, saveSecuritySettings, uploadStoreLogo,
} from "./service";

const uploadLogoSchema = z.object({
  dataUrl: z.string().min(20),
  mime: z.string().min(1),
});

export async function uploadStoreLogoAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("settings.manage");
    return ok(await uploadStoreLogo(user.id, uploadLogoSchema.parse(raw)));
  });
}

export async function saveStoreSettingsAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("settings.manage");
    const s = await saveStoreSettings(user.id, raw);
    return ok({ name: s.name });
  });
}

export async function saveSalesSettingsAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("settings.manage");
    const s = await saveSalesSettings(user.id, raw);
    revalidatePath("/sales/pos");
    return ok({ invoicePrefix: s.invoicePrefix });
  });
}

export async function saveInventorySettingsAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("settings.manage");
    const s = await saveInventorySettings(user.id, raw);
    revalidatePath("/dashboard");
    return ok({ expirationWarningDays: s.expirationWarningDays });
  });
}

export async function saveLocalizationSettingsAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("settings.manage");
    const s = await saveLocalizationSettings(user.id, raw);
    revalidatePath("/", "layout");
    return ok({ language: s.language });
  });
}

export async function saveSecuritySettingsAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("settings.manage");
    const s = await saveSecuritySettings(user.id, raw);
    return ok({ sessionTimeoutMinutes: s.sessionTimeoutMinutes });
  });
}
