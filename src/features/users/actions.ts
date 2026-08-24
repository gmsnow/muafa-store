"use server";

import { revalidatePath } from "next/cache";
import { guard, ok } from "@/shared/core/api-response";
import { requirePermission } from "@/features/auth/session";
import {
  saveUser, setUserStatus, softDeleteUser, getUserForEdit,
} from "./service";

export async function saveUserAction(raw: unknown, editId?: string | null) {
  return guard(async () => {
    const user = await requirePermission("users.manage");
    const u = await saveUser(user, raw, editId ?? null);
    revalidatePath("/users");
    return ok({ id: u.id });
  });
}

export async function getUserForEditAction(id: string) {
  return guard(async () => {
    await requirePermission("users.view");
    return ok(await getUserForEdit(id));
  });
}

export async function setUserStatusAction(id: string, status: "ACTIVE" | "SUSPENDED") {
  return guard(async () => {
    const user = await requirePermission("users.manage");
    await setUserStatus(user, id, status);
    revalidatePath("/users");
    return ok({ status });
  });
}

export async function deleteUserAction(id: string) {
  return guard(async () => {
    const user = await requirePermission("users.manage");
    await softDeleteUser(user, id);
    revalidatePath("/users");
    return ok({ deleted: true });
  });
}
