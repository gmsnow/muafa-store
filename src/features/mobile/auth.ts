import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { db } from "@/shared/db";
import { verifySessionToken } from "@/features/auth/session";
import { hashToken } from "@/features/auth/session";
import type { PermissionKey } from "@/shared/auth/rbac";

export interface MobileUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  fullNameAr: string | null;
  roleName: string;
  permissions: PermissionKey[];
  mustChangePassword: boolean;
}

/** Extract Bearer token from Authorization header, verify session, return user. */
export const getMobileUser = cache(async (): Promise<MobileUser | null> => {
  const hdrs = await headers();
  const auth = hdrs.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
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
    permissions:
      session.user.role.name === "SUPER_ADMIN"
        ? ["*"]
        : session.user.role.rolePermissions.map((rp) => rp.permissionKey),
    mustChangePassword: session.user.mustChangePassword,
  };
});
