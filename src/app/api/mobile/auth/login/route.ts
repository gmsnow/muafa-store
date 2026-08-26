import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { authenticate } from "@/features/auth/service";
import { signSessionToken, hashToken } from "@/features/auth/session";
import { db } from "@/shared/db";
import { headers } from "next/headers";
import { mobileGuard } from "@/features/mobile/guard";
import { loginSchema } from "@/features/auth/schema";

interface LoginResponse {
  token: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    fullNameAr: string | null;
    roleName: string;
    permissions: string[];
    mustChangePassword: boolean;
  };
}

export async function POST(req: NextRequest) {
  return mobileGuard(async (): Promise<LoginResponse> => {
    const body = await req.json();
    const parsed = loginSchema.parse(body);

    const { userId } = await authenticate(parsed);

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = h.get("user-agent") ?? null;

    const sid = randomUUID();
    const maxAgeSeconds = parsed.remember ? 30 * 24 * 60 * 60 : 480 * 60;
    const token = await signSessionToken({ sub: userId, sid }, maxAgeSeconds);
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    await db.session.create({
      data: {
        userId,
        tokenHash: hashToken(sid),
        ip,
        userAgent,
        expiresAt,
      },
    });

    const session = await db.session.findUnique({
      where: { tokenHash: hashToken(sid) },
      include: {
        user: {
          include: { role: { include: { rolePermissions: { select: { permissionKey: true } } } } },
        },
      },
    });

    const user = session!.user;
    const roleName = user.role.name;
    const permissions = roleName === "SUPER_ADMIN"
      ? ["*"]
      : user.role.rolePermissions.map((rp) => rp.permissionKey);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        fullNameAr: user.fullNameAr ?? user.fullName,
        roleName,
        permissions,
        mustChangePassword: user.mustChangePassword,
      },
    };
  });
}
