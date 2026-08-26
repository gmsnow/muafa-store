import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { listProducts, createProduct } from "@/features/inventory/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const brandId = searchParams.get("brandId") ?? undefined;
    const status = (searchParams.get("status") as "active" | "inactive" | "all") ?? undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    return listProducts({ q, categoryId, brandId, status, page, pageSize });
  });
}

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("products.create")) {
      throw new AppError("FORBIDDEN", "You do not have permission to create products");
    }

    const body = await request.json();
    const product = await createProduct(user.id, body);
    return product;
  });
}
