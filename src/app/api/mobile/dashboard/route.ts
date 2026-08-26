import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import {
  getDashboardKpis,
  getSalesSeries,
  getTopProducts,
  getRecentSales,
  listLowStock,
  listExpiringBatches,
} from "@/features/dashboard/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const chartRange = (searchParams.get("chartRange") as "today" | "week" | "month" | "year") ?? "week";

    const [kpis, chartData, topProducts, recentSales, lowStock, expiringBatches] = await Promise.all([
      getDashboardKpis(),
      getSalesSeries(chartRange),
      getTopProducts(30, 5),
      getRecentSales(7),
      listLowStock(10),
      listExpiringBatches(undefined, 10),
    ]);

    return {
      kpis,
      chartData,
      topProducts,
      recentSales,
      lowStock,
      expiringBatches,
    };
  });
}
