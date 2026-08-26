import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { getCustomerForEdit, saveCustomer, softDeleteCustomer } from "@/features/customers/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { id } = await params;
    return getCustomerForEdit(id);
  });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { id } = await params;
    const body = await request.json();
    return saveCustomer(id, body);
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { id } = await params;
    await softDeleteCustomer(id);
    return { deleted: true };
  });
}
