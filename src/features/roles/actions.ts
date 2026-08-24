"use server";

import { revalidatePath } from "next/cache";
import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import { saveRole, deleteRole } from "./service";

export async function saveRoleAction(raw: unknown) {
  return guard(async () => {
    const user = await requirePermission("roles.manage");
    const r = await saveRole(user, raw as Parameters<typeof saveRole>[1]);
    revalidatePath("/roles");
    return ok({ id: r.id });
  });
}

export async function deleteRoleAction(id: string) {
  return guard(async () => {
    await requirePermission("roles.manage");
    await deleteRole(id);
    revalidatePath("/roles");
    return ok({ deleted: true });
  });
}
