import { getT } from "@/shared/i18n";
import { getStoreSettings } from "@/features/settings/service";
import { syncNotifications } from "@/features/notifications/service";
import type { AuthUser } from "@/features/auth/session";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * Streamed shell sections. The (app) layout only blocks on auth, then renders
 * these inside Suspense so the sidebar, topbar and page (including its own
 * skeletons) paint independently. getStoreSettings() is React-cache()'d and
 * syncNotifications() has a 20s TTL, so the two sections share one of each.
 */

export async function SidebarSection({ user }: { user: AuthUser }) {
  const { t } = await getT();
  const store = await getStoreSettings();
  return (
    <Sidebar
      t={t}
      permissions={user.permissions}
      storeName={store?.nameAr ?? store?.name ?? t.auth.storeName}
    />
  );
}

export async function TopbarSection({ user }: { user: AuthUser }) {
  const { t } = await getT();
  const [store, notificationRows] = await Promise.all([
    getStoreSettings(),
    syncNotifications(),
  ]);
  const notifications = notificationRows.map((n) => ({
    id: n.id, type: n.type, body: n.body ?? "", href: n.href,
    isRead: n.isRead, createdAt: n.createdAt.toISOString(),
  }));
  const aiVoice = Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  return (
    <Topbar
      t={t}
      userName={user.fullNameAr ?? user.fullName}
      roleName={user.roleName}
      permissions={user.permissions}
      notifications={notifications}
      storeName={store?.nameAr ?? store?.name ?? t.auth.storeName}
      aiVoice={aiVoice}
    />
  );
}