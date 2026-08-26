import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { verifySessionToken, hashToken } from "@/features/auth/session";
import { db } from "@/shared/db";
import { mobileGuard } from "@/features/mobile/guard";

export async function POST(_req: NextRequest) {
  return mobileGuard(async (): Promise<{ message: string }> => {
    const h = await headers();
    const authHeader = h.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return { message: "Logged out" };
    }

    const token = authHeader.slice(7);
    const payload = await verifySessionToken(token);
    if (payload) {
      await db.session.updateMany({
        where: { tokenHash: hashToken(payload.sid), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return { message: "Logged out" };
  });
}
