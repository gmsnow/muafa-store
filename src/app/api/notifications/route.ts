import { NextResponse } from "next/server";
import { guard, ok } from "@/shared/core/api-response";
import { getCurrentUser } from "@/features/auth/session";
import { listNotifications, unreadCount } from "@/features/notifications/service";

export async function GET() {
  const res = await guard(async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("UNAUTHORIZED");
    const [items, unread] = await Promise.all([listNotifications(25), unreadCount()]);
    return ok({
      items: items.map((n) => ({
        id: n.id, type: n.type, body: n.body ?? "", href: n.href,
        isRead: n.isRead, createdAt: n.createdAt.toISOString(),
      })),
      unread,
    });
  });
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
