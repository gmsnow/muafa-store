import { redirect } from "next/navigation";
import { db } from "@/shared/db";
import { getCurrentUser } from "@/features/auth/session";
import { getT } from "@/shared/i18n";
import { Sidebar } from "@/features/shell/sidebar";
import { Topbar } from "@/features/shell/topbar";
import { syncNotifications } from "@/features/notifications/service";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Route through /api/auth/expire so a stale-but-signed cookie gets cleared
  // instead of ping-ponging with the proxy's login redirect.
  if (!user) redirect("/api/auth/expire?next=%2Flogin");
  if (user.mustChangePassword) redirect("/change-password");

  const { t } = await getT();
  const store = await db.storeSettings.findUnique({ where: { id: "store" } });
  const aiVoice = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  const notifications = (await syncNotifications()).map((n) => ({
    id: n.id, type: n.type, body: n.body ?? "", isRead: n.isRead,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="flex min-h-screen">
      <Sidebar
        t={t}
        permissions={user.permissions}
        storeName={store?.nameAr ?? store?.name ?? t.auth.storeName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          t={t}
          userName={user.fullNameAr ?? user.fullName}
          roleName={user.roleName}
          permissions={user.permissions}
          notifications={notifications}
          storeName={store?.nameAr ?? store?.name ?? t.auth.storeName}
          aiVoice={aiVoice}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

