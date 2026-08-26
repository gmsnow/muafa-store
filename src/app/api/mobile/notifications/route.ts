import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { NextRequest } from "next/server";
import { listNotifications, markAllRead, unreadCount } from "@/features/notifications/service";

export async function GET() {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const [items, unread] = await Promise.all([listNotifications(25), unreadCount()]);
    return {
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        body: n.body ?? "",
        href: n.href,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
    };
  });
}

export async function POST(_request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    await markAllRead();
    return { marked: true };
  });
}
