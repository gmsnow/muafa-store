import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Placeholder grid for streaming stat-card sections. */
export function StatsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-24" />
          <Skeleton className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a streaming table section (header band + rows). */
export function TableSkeleton({ rows = 6, cols = 7, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardContent className="px-0 pb-0">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          {Array.from({ length: cols }, (_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-4 py-3.5 last:border-0">
            {Array.from({ length: cols }, (_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Placeholder block for a streaming dashboard panel. */
export function PanelSkeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl border bg-card", className)} />;
}

/** Placeholder for the streamed app sidebar (mirrors Sidebar dimensions). */
export function SidebarSkeleton() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="animate-pulse flex-1 space-y-5 overflow-hidden p-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </div>
    </aside>
  );
}

/** Placeholder for the streamed topbar (mirrors Topbar layout, avoids jumps). */
export function TopbarSkeleton() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3">
      <div className="animate-pulse flex min-w-0 flex-1 items-center gap-2 sm:max-w-sm">
        <Skeleton className="size-9 md:hidden" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="ms-auto flex items-center gap-1">
        <Skeleton className="size-9" />
        <Skeleton className="size-9" />
        <Skeleton className="size-9" />
        <Skeleton className="h-9 w-32" />
      </div>
    </header>
  );
}