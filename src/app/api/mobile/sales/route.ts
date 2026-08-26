import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { listSales } from "@/features/sales/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const cashierId = searchParams.get("cashierId") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;

    return listSales({ q, status, cashierId, from, to, page });
  });
}
