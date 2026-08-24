"use server";

import { guard, ok } from "@/shared/core/api-response";
import { getCurrentUser } from "@/features/auth/session";
import { globalSearch } from "./service";

export async function globalSearchAction(q: string) {
  return guard(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    return ok(await globalSearch(q));
  });
}
