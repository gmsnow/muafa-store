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