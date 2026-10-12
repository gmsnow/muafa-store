import type { CSSProperties } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatTone = "primary" | "success" | "warning" | "danger" | "info";

const TONES: Record<StatTone, { chip: string; blob: string }> = {
  primary: { chip: "text-primary bg-primary/10 ring-primary/20", blob: "bg-primary" },
  success: { chip: "text-emerald-600 bg-emerald-500/10 ring-emerald-500/20 dark:text-emerald-400", blob: "bg-emerald-500" },
  warning: { chip: "text-amber-600 bg-amber-500/10 ring-amber-500/20 dark:text-amber-400", blob: "bg-amber-500" },
  danger: { chip: "text-destructive bg-destructive/10 ring-destructive/20", blob: "bg-destructive" },
  info: { chip: "text-sky-600 bg-sky-500/10 ring-sky-500/20 dark:text-sky-400", blob: "bg-sky-500" },
};

interface Props {
  title: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: StatTone;
  href?: string;
  /** Entrance stagger in milliseconds (0 = instant). */
  delay?: number;
}

/** Compact KPI card for the customer pages — optional `href` makes it a link. */
export function StatCard({ title, value, hint, icon: Icon, tone = "primary", href, delay = 0 }: Props) {
  const t = TONES[tone];
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -end-8 -top-8 size-24 rounded-full opacity-20 blur-2xl transition-opacity group-hover/card:opacity-35",
          t.blob,
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-1 truncate text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover/card:-rotate-6 group-hover/card:scale-110",
            t.chip,
          )}
        >
          <Icon className="size-5" />
        </span>
      </div>
      {hint && <p className="relative mt-2 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  );

  return (
    <Card
      className={cn(
        "animate-enter relative p-4 transition-all duration-200",
        href && "hover:-translate-y-0.5 hover:shadow-lg hover:ring-foreground/20",
      )}
      style={{ "--tw-enter-delay": `${delay}ms` } as CSSProperties}
    >
      {href ? (
        <Link href={href} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
