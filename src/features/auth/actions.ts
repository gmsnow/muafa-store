"use server";

import { guard, ok, fail } from "@/shared/core/api-response";
import { authenticate, requestPasswordReset, resetPassword, changeOwnPassword } from "./service";
import { issueSession, destroyCurrentSession, getCurrentUser } from "./session";
import { loginSchema, forgotPasswordSchema, resetPasswordSchema, changeOwnPasswordSchema } from "./schema";
import { recordAudit } from "@/shared/core/audit";
import { db } from "@/shared/db";
import { headers } from "next/headers";

export async function loginAction(input: unknown) {
  return guard(async () => {
    const parsed = loginSchema.parse(input);
    const { userId } = await authenticate(parsed);
    const h = await headers();
    await issueSession(userId, {
      remember: parsed.remember,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent"),
    });
    return ok({ redirect: "/dashboard" });
  });
}

export async function logoutAction() {
  return guard(async () => {
    const user = await getCurrentUser();
    if (user) {
      const h = await headers();
      await recordAudit(db, {
        userId: user.id,
        action: "LOGOUT",
        entityType: "User",
        entityId: user.id,
        ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: h.get("user-agent"),
      });
    }
    await destroyCurrentSession();
    return ok({ redirect: "/login" });
  });
}

export async function forgotPasswordAction(input: unknown) {
  return guard(async () => {
    const parsed = forgotPasswordSchema.parse(input);
    const result = await requestPasswordReset(parsed);
    // Generic message regardless of account existence.
    return ok({
      message: "If the email exists, a reset link has been generated. Check server logs in this deployment.",
      ...(result.devToken ? { devToken: result.devToken } : {}),
    });
  });
}

export async function resetPasswordAction(input: unknown) {
  return guard(async () => {
    const parsed = resetPasswordSchema.parse(input);
    if (!parsed.token) return fail("INVALID_TOKEN", "Missing token");
    await resetPassword(parsed);
    return ok({ redirect: "/login" });
  });
}

export async function changeOwnPasswordAction(input: unknown) {
  return guard(async () => {
    const user = await getCurrentUser();
    if (!user) return fail("UNAUTHORIZED", "Authentication required");
    const parsed = changeOwnPasswordSchema.parse(input);
    await changeOwnPassword(user.id, parsed.password);
    return ok({ redirect: "/dashboard" });
  });
}
