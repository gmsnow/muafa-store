import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { listPurchaseOrders, createPurchaseOrder } from "@/features/procurement/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const status = searchParams.get("status") as "DRAFT" | "PENDING" | "APPROVED" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED" | undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    return listPurchaseOrders({ q, status, page, pageSize });
  });
}

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("procurement.create")) {
      throw new AppError("FORBIDDEN", "You do not have permission to create purchase orders");
    }

    const body = await request.json();
    return createPurchaseOrder(user.id, body);
  });
}
