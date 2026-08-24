"use server";

import { revalidatePath } from "next/cache";
import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import { createBackup, deleteBackup } from "./service";

export async function createBackupAction(note?: string) {
  return guard(async () => {
    const user = await requirePermission("backup.manage");
    const rec = await createBackup(user, note);
    revalidatePath("/settings/backup");
    return ok({ id: rec.id, filename: rec.filename });
  });
}

export async function deleteBackupAction(id: string) {
  return guard(async () => {
    await requirePermission("backup.manage");
    await deleteBackup(id);
    revalidatePath("/settings/backup");
    return ok({ deleted: true });
  });
}
