import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { parseReportRange, isReportFamily } from "@/features/reports/schema";
import {
  salesReport,
  purchasesReport,
  profitReport,
  inventoryValuation,
  customersReport,
  suppliersReport,
  expensesReport,
  financialSummary,
} from "@/features/reports/service";

type RouteContext = { params: Promise<{ type: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("reports.view")) {
      throw new AppError("FORBIDDEN", "You do not have permission to view reports");
    }

    const { type } = await params;
    if (!isReportFamily(type) && type !== "summary" && type !== "tax") {
      throw new AppError("NOT_FOUND", "Unknown report type");
    }

    const { searchParams } = new URL(request.url);
    const range = parseReportRange({ from: searchParams.get("from"), to: searchParams.get("to") });

    switch (type) {
      case "sales": return salesReport(range);
      case "purchases": return purchasesReport(range);
      case "profit": return profitReport(range);
      case "inventory": return inventoryValuation();
      case "customers": return customersReport(range);
      case "suppliers": return suppliersReport(range);
      case "expenses": return expensesReport(range);
      case "summary": return financialSummary(range);
      default: throw new AppError("NOT_FOUND", "Unknown report type");
    }
  });
}
