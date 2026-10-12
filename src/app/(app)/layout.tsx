import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/features/auth/session";
import { SidebarSection, TopbarSection } from "@/features/shell/layout-sections";
import { SidebarSkeleton, TopbarSkeleton } from "@/components/ui/page-skeletons";
import { SafeSection } from "@/components/ui/safe-section";

// Every route under (app) reads the database on demand. Defer entirely to the
// request renderer — never let the build's prerender pass open DB connections
// (they trip Vercel/Supabase pool limits and make deploys flaky).
export const dynamic = "force-dynamic";

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
  // so the page (and its skeletons) paint the moment the user is known. A
  // failing sub-section degrades to its card instead of aborting the render.
  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<SidebarSkeleton />}>
        <SafeSection name="shell.sidebar" run={() => SidebarSection({ user })} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<TopbarSkeleton />}>
          <SafeSection name="shell.topbar" run={() => TopbarSection({ user })} />
        </Suspense>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}