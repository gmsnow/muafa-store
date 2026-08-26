"use server";

import { revalidatePath } from "next/cache";
import { guard, ok } from "@/shared/core/api-response";
import { getCurrentUser } from "@/features/auth/session";
import { listNotifications, markAllRead, deleteNotification } from "./service";

export async function markAllReadAction() {
  return guard(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    await markAllRead();
    revalidatePath("/dashboard", "layout");
    return ok({ done: true });
  });
}

export async function listNotificationsAction() {
  return guard(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    return ok(await listNotifications());
  });
}

export async function deleteNotificationAction(id: string) {
  return guard(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    await deleteNotification(id);
    revalidatePath("/dashboard", "layout");
    return ok({ done: true });
  });
}
