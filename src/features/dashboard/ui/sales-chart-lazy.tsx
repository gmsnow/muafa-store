"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { SalesChartPoint } from "../service";

const SalesChart = dynamic(() => import("./sales-chart"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full" />,
});

export function SalesChartLazy({ data, labels }: { data: SalesChartPoint[]; labels: { revenue: string; cost: string; profit: string } }) {
  return <SalesChart data={data} labels={labels} />;
}
