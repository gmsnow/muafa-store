import type { CSSProperties } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: string;
  icon: LucideIcon;
  trendPercent?: number | null;
  trendLabel?: string;
  accent?: string;
  tone?: "default" | "warning" | "danger" | "success";
  href?: string;
  delay?: number;
}

const toneClasses = {
  default: "text-primary bg-primary/10",
  warning: "text-amber-600 bg-amber-500/10 dark:text-amber-400",
  danger: "text-destructive bg-destructive/10",
  success: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-400",
} as const;

export function StatCard({ title, value, icon: Icon, trendPercent, trendLabel, accent, tone = "default", href, delay = 0 }: Props) {
  const up = (trendPercent ?? 0) >= 0;
  const body = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 truncate text-xl font-bold tracking-tight">{value}</p>
      </div>
      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover/card:-rotate-6 group-hover/card:scale-110", toneClasses[tone], accent)}>
        <Icon className="size-4" />
      </div>
    </div>
  );
  return (
    <Card
      className={cn("animate-pop p-4 transition-all duration-200", href && "hover:-translate-y-0.5 hover:shadow-lg hover:ring-foreground/20")}
      style={{ "--tw-enter-delay": `${delay}ms` } as CSSProperties}
    >
      {href ? (
        <Link href={href} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
          {trendPercent !== undefined && trendPercent !== null && (
            <p className="mt-2 flex items-center gap-1 text-xs">
              <span className={cn("flex items-center gap-0.5 font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {Math.abs(trendPercent).toFixed(1)}%
              </span>
              {trendLabel && <span className="truncate text-muted-foreground">{trendLabel}</span>}
            </p>
          )}
        </Link>
      ) : (
        <>
          {body}
          {trendPercent !== undefined && trendPercent !== null && (
            <p className="mt-2 flex items-center gap-1 text-xs">
              <span className={cn("flex items-center gap-0.5 font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {Math.abs(trendPercent).toFixed(1)}%
              </span>
              {trendLabel && <span className="truncate text-muted-foreground">{trendLabel}</span>}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
