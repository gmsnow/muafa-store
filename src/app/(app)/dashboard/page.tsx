import { Suspense } from "react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getT } from "@/shared/i18n";
import { PanelSkeleton, StatsSkeleton } from "@/components/ui/page-skeletons";
import type { ChartRange } from "@/features/dashboard/service";
import {
  KpiGrid, ChartsSection, TopProductsSection, StockPanelsSection,
} from "@/features/dashboard/ui/dashboard-sections";

const RANGES: ChartRange[] = ["today", "week", "month", "year"];

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const { t } = await getT();
  const params = await searchParams;
  const range: ChartRange = RANGES.includes(params.range as ChartRange) ? (params.range as ChartRange) : "month";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="animate-enter text-2xl font-bold tracking-tight">{t.dashboard.title}</h1>
          <p className="text-sm text-muted-foreground">{t.dashboard.welcome}</p>
        </div>
        <Tabs defaultValue={range}>
          <TabsList>
            {RANGES.map((r) => (
              <TabsTrigger key={r} value={r} asChild>
                <Link href={`/dashboard?range=${r}`}>{t.common[r]}</Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Suspense fallback={<StatsSkeleton count={8} />}>
        <KpiGrid />
      </Suspense>

      <Suspense fallback={<div className="grid gap-4 lg:grid-cols-3"><PanelSkeleton className="h-72 lg:col-span-2" /><PanelSkeleton className="h-72" /></div>}>
        <ChartsSection range={range} />
      </Suspense>

      <Suspense fallback={<div className="grid gap-4 lg:grid-cols-2"><PanelSkeleton className="h-64" /><PanelSkeleton className="h-64" /></div>}>
        <TopProductsSection />
      </Suspense>

      <Suspense fallback={<div className="grid gap-4 lg:grid-cols-2"><PanelSkeleton className="h-56" /><PanelSkeleton className="h-56" /></div>}>
        <StockPanelsSection />
      </Suspense>
    </div>
  );
}