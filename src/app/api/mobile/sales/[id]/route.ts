import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { getSaleDetail } from "@/features/sales/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { id } = await params;
    return getSaleDetail(id);
  });
}
