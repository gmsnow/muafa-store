import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { SidebarSection, TopbarSection } from "@/features/shell/layout-sections";
import { SidebarSkeleton, TopbarSkeleton } from "@/components/ui/page-skeletons";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Defer to a real request so the build's prerender pass never opens DB
  // connections — they saturate Supabase's session-mode pooler (max 15).
  await connection();
  const user = await getCurrentUser();
  // Route through /api/auth/expire so a stale-but-signed cookie gets cleared
  // instead of ping-ponging with the proxy's login redirect.
  if (!user) redirect("/api/auth/expire?next=%2Flogin");
  if (user.mustChangePassword) redirect("/change-password");

  // Only auth blocks the shell. Settings + notifications stream independently,
  // so the page (and its skeletons) paint the moment the user is known.
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<SidebarSkeleton />}>
        <SidebarSection user={user} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarSkeleton />}>
          <TopbarSection user={user} />
        </Suspense>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}