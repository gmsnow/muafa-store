import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/shared/db";
import { hasPermission } from "@/shared/auth/rbac";
import type { PermissionKey } from "@/shared/auth/rbac";

const SESSION_COOKIE = "gs_session";
const DEFAULT_TIMEOUT_MINUTES = 480; // fallback if settings unavailable
const REMEMBER_ME_DAYS = 30;

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET missing or too short — set it in .env");
  }
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  sub: string; // user id
  sid: string; // session id (jti)
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function signSessionToken(payload: SessionPayload, maxAgeSeconds: number): Promise<string> {
  return new SignJWT({ sid: payload.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + maxAgeSeconds)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || typeof payload.sid !== "string") return null;
    return { sub: payload.sub, sid: payload.sid };
  } catch {
    return null;
  }
}

export async function issueSession(userId: string, opts: { remember?: boolean; ip?: string | null; userAgent?: string | null } = {}) {
  const maxAgeSeconds = opts.remember ? REMEMBER_ME_DAYS * 24 * 60 * 60 : DEFAULT_TIMEOUT_MINUTES * 60;
  const payload: SessionPayload = { sub: userId, sid: randomUUID() };
  const token = await signSessionToken(payload, maxAgeSeconds);
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(payload.sid),
      ip: opts.ip ?? null,
      userAgent: opts.userAgent ?? null,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const payload = await verifySessionToken(token);
    if (payload) {
      await db.session.updateMany({
        where: { tokenHash: hashToken(payload.sid), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
  cookieStore.delete(SESSION_COOKIE);
}

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  fullNameAr: string | null;
  roleName: string;
  permissions: PermissionKey[];
  mustChangePassword: boolean;
}

/** Request-scoped cached current user. Returns null for anonymous/invalid/revoked sessions. */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(payload.sid) },
    include: {
      user: {
        include: { role: { include: { rolePermissions: { select: { permissionKey: true } } } } },
      },
    },
  });

  if (!session || session.revokedAt !== null || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE" || session.user.deletedAt !== null) return null;

  return {
    id: session.user.id,
    username: session.user.username,
    email: session.user.email,
    fullName: session.user.fullName,
    fullNameAr: session.user.fullNameAr ?? session.user.fullName,
    roleName: session.user.role.name,
    permissions: session.user.role.name === "SUPER_ADMIN"
      ? ["*"]
      : session.user.role.rolePermissions.map((rp) => rp.permissionKey),
    mustChangePassword: session.user.mustChangePassword,
  };
});

/** Guard for server actions / route handlers. Throws AppError on failure. */
export async function requirePermission(required: PermissionKey): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new (await import("@/shared/core/api-response")).AppError("UNAUTHORIZED", "Authentication required");
  if (!hasPermission(user.permissions, required)) {
    throw new (await import("@/shared/core/api-response")).AppError("FORBIDDEN", "You do not have permission for this action");
  }
  return user;
}
