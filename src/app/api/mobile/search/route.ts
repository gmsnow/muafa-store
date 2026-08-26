import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { globalSearch } from "@/features/search/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";

    return globalSearch(q);
  });
}
