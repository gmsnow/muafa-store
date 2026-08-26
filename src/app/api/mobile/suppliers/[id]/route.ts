import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { getSupplierForEdit, saveSupplier } from "@/features/procurement/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { id } = await params;
    return getSupplierForEdit(id);
  });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("suppliers.manage")) {
      throw new AppError("FORBIDDEN", "You do not have permission to update suppliers");
    }

    const { id } = await params;
    const body = await request.json();
    return saveSupplier(id, body);
  });
}
