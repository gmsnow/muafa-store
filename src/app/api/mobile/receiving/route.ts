import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { receivePurchase } from "@/features/procurement/service";

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("procurement.receive")) {
      throw new AppError("FORBIDDEN", "You do not have permission to receive goods");
    }

    const body = await request.json();
    return receivePurchase(user.id, body);
  });
}
