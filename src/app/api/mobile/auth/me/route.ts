import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import type { AuthUser } from "@/features/auth/session";

export async function GET() {
  return mobileGuard(async (): Promise<AuthUser> => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    return user;
  });
}
