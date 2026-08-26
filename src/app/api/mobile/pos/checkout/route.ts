import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { createSale } from "@/features/sales/service";

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("sales.create")) {
      throw new AppError("FORBIDDEN", "You do not have permission to create sales");
    }

    const body = await request.json();
    return createSale(user.id, body);
  });
}
