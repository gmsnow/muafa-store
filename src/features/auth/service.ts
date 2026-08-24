import "server-only";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { db } from "@/shared/db";
import { AppError } from "@/shared/core/api-response";
import { logger } from "@/shared/core/logger";
import { recordAudit } from "@/shared/core/audit";
import type { LoginInput, ForgotPasswordInput, ResetPasswordInput } from "./schema";

const BCRYPT_ROUNDS = 12;
const IP_WINDOW_MINUTES = 10;
const IP_MAX_FAILURES = 20;

async function requestMeta() {
  // headers() throws outside a request scope (e.g. smoke tests) — degrade gracefully.
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function getSecuritySettings() {
  const settings = await db.systemSettings.findUnique({ where: { id: "system" } });
  return {
    maxLoginAttempts: settings?.maxLoginAttempts ?? 5,
    lockoutMinutes: settings?.lockoutMinutes ?? 15,
    passwordMinLength: settings?.passwordMinLength ?? 8,
  };
}

export async function authenticate(input: LoginInput): Promise<{ userId: string; username: string }> {
  const meta = await requestMeta();
  const identity = input.identity.toLowerCase();
  const security = await getSecuritySettings();

  // IP-level throttle
  const windowStart = new Date(Date.now() - IP_WINDOW_MINUTES * 60 * 1000);
  const recentFailures = await db.loginActivity.count({
    where: { ip: meta.ip, success: false, createdAt: { gte: windowStart } },
  });
  if (recentFailures >= IP_MAX_FAILURES) {
    logger.warn("login_ip_throttled", { ip: meta.ip });
    throw new AppError("TOO_MANY_ATTEMPTS", "Too many attempts. Try again later.");
  }

  const user = await db.user.findFirst({
    where: {
      OR: [{ username: identity }, { email: identity }],
      deletedAt: null,
    },
  });

  const logActivity = (success: boolean, reason?: string) =>
    db.loginActivity.create({
      data: {
        userId: user?.id ?? null,
        email: input.identity,
        success,
        reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

  if (!user) {
    await logActivity(false, "UNKNOWN_IDENTITY");
    // Uniform error — no user enumeration.
    throw new AppError("INVALID_CREDENTIALS", "Invalid credentials / بيانات الدخول غير صحيحة");
  }

  if (user.status === "SUSPENDED") {
    await logActivity(false, "SUSPENDED");
    throw new AppError("ACCOUNT_SUSPENDED", "Account suspended / الحساب موقوف");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logActivity(false, "LOCKED");
    throw new AppError("ACCOUNT_LOCKED", "Account temporarily locked / الحساب مقفل مؤقتاً");
  }

  const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= security.maxLoginAttempts;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + security.lockoutMinutes * 60 * 1000) : null,
      },
    });
    await logActivity(false, shouldLock ? "NOW_LOCKED" : "BAD_PASSWORD");
    await recordAudit(db, {
      userId: user.id,
      action: "LOGIN_FAILED",
      entityType: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    throw new AppError(
      shouldLock ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
      shouldLock ? `Account locked for ${security.lockoutMinutes} minutes` : "Invalid credentials / بيانات الدخول غير صحيحة",
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await logActivity(true);
  await recordAudit(db, {
    userId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });

  return { userId: user.id, username: user.username };
}

/** Creates a single-use reset token. Always returns a generic result to avoid enumeration. */
export async function requestPasswordReset(input: ForgotPasswordInput): Promise<{ devToken?: string }> {
  const meta = await requestMeta();
  const user = await db.user.findFirst({ where: { email: input.email.toLowerCase(), deletedAt: null } });

  let devToken: string | undefined;
  if (user) {
    const rawToken = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await recordAudit(db, {
      userId: user.id,
      action: "PASSWORD_RESET_REQUESTED",
      entityType: "User",
      entityId: user.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    // No mailer infrastructure in this deployment: the token is surfaced in server logs only.
    logger.info("password_reset_token_issued", { userId: user.id, token: rawToken });
    if (process.env.NODE_ENV !== "production") devToken = rawToken;
  }

  return { devToken };
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const meta = await requestMeta();
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!record || record.usedAt !== null || record.expiresAt < new Date()) {
    throw new AppError("INVALID_TOKEN", "Reset link is invalid or expired");
  }
  if (input.password.length < 8) {
    throw new AppError("WEAK_PASSWORD", "Password must be at least 8 characters");
  }

  const passwordHash = await hashPassword(input.password);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  await recordAudit(db, {
    userId: record.userId,
    action: "PASSWORD_RESET_COMPLETED",
    entityType: "User",
    entityId: record.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
}

/** Self-service password change (first-login forced change or profile change). */
export async function changeOwnPassword(userId: string, newPassword: string): Promise<void> {
  const security = await getSecuritySettings();
  if (newPassword.length < security.passwordMinLength) {
    throw new AppError("WEAK_PASSWORD", `Password must be at least ${security.passwordMinLength} characters`);
  }
  const passwordHash = await hashPassword(newPassword);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
  });
  await recordAudit(db, {
    userId,
    action: "PASSWORD_CHANGE_SELF",
    entityType: "User",
    entityId: userId,
  });
}
