import { NextRequest } from "next/server";
import { getMobileUser } from "@/features/mobile/auth";
import { mobileGuard } from "@/features/mobile/guard";
import { AppError } from "@/shared/core/api-response";
import { listCustomerTransactions, recordCustomerTxn, findCustomerTxnDuplicate } from "@/features/customers/service";

export async function GET(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId") ?? undefined;
    const type = (searchParams.get("type") as "PAYMENT" | "DEBT" | "REFUND" | "ADJUSTMENT") ?? undefined;
    const q = searchParams.get("q") ?? undefined;
    const month = searchParams.get("month") ?? undefined;
    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;

    return listCustomerTransactions({ customerId, type, q, month, page, pageSize });
  });
}

export async function POST(request: NextRequest) {
  return mobileGuard(async () => {
    const user = await getMobileUser();
    if (!user) throw new AppError("UNAUTHORIZED", "Authentication required");
    if (!user.permissions.includes("*") && !user.permissions.includes("customers.credit")) {
      throw new AppError("FORBIDDEN", "You do not have permission to record customer transactions");
    }

    const body = await request.json();
    // A submission without an idempotency key is treated as a retry: if an
    // identical row already exists for this cashier, return it instead of
    // minting a duplicate.
    if (
      !body?.clientId &&
      body?.customerId &&
      body?.type &&
      typeof body?.amount !== "undefined"
    ) {
      const dup = await findCustomerTxnDuplicate(user.id, body);
      if (dup) return { id: dup.id, balanceAfter: dup.balanceAfter.toString() };
    }
    return recordCustomerTxn(user.id, body);
  });
}
