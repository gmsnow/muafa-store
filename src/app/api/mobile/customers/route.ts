import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { listCustomers, saveCustomer } from "@/features/customers/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const groupId = searchParams.get("groupId") ?? undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;
    const includeInactive = searchParams.get("includeInactive") === "true";

    return listCustomers({ q, groupId, includeInactive, page, pageSize });
  });
}

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const body = await request.json();
    return saveCustomer(null, body);
  });
}
