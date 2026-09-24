import { NextRequest, NextResponse } from "next/server";
import { purgeDuplicateTxns } from "@/features/customers/dedupe";
import { notify } from "@/features/notifications/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  // Vercel cron runs send the x-vercel-cron header and a bearer token.
  if (request.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run() {
  const result = await purgeDuplicateTxns();
  if (result.purged > 0) {
    await notify({
      type: "FAILED_OPERATION",
      title: "تم كشف وحذف صفوف مكررة تلقائياً",
      body: `حُذف ${result.purged} صفاً مكرراً وأعيد ضبط الأرصدة لـ ${result.affectedCustomers.length} عميل`,
      href: "/customers/transactions",
    });
  }
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return run();
}