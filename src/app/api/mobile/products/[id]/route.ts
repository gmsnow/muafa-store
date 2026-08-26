import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { getProductForEdit, updateProduct, softDeleteProduct } from "@/features/inventory/service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { id } = await params;
    return getProductForEdit(id);
  });
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("products.update")) {
      throw new AppError("FORBIDDEN", "You do not have permission to update products");
    }

    const { id } = await params;
    const body = await request.json();
    return updateProduct(user.id, id, body);
  });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("products.delete")) {
      throw new AppError("FORBIDDEN", "You do not have permission to delete products");
    }

    const { id } = await params;
    await softDeleteProduct(user.id, id);
    return { deleted: true };
  });
}
