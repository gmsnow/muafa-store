import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { listExpenses, saveExpense } from "@/features/expenses/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId") ?? undefined;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    return listExpenses({ categoryId, from, to, page, pageSize });
  });
}

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("expenses.manage")) {
      throw new AppError("FORBIDDEN", "You do not have permission to create expenses");
    }

    const body = await request.json();
    return saveExpense(user.id, body);
  });
}
