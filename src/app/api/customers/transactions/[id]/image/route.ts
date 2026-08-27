import { NextResponse } from "next/server";
import { requirePermission } from "@/features/auth/session";
import { getCustomerTxnImage } from "@/features/customers/service";
import { AppError } from "@/shared/core/api-response";

/**
 * Auth-gated image proxy. The storage bucket stays private; only users with
 * customers.view can fetch a transaction's note image, which never exposes a
 * public URL or signed link to the browser.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/customers/transactions/[id]/image">) {
  try {
    await requirePermission("customers.view");
    const { id } = await ctx.params;
    const { data, contentType } = await getCustomerTxnImage(id);
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(data.byteLength),
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      const status =
        err.code === "UNAUTHORIZED" ? 401
        : err.code === "FORBIDDEN" ? 403
        : err.code === "NOT_FOUND" ? 404
        : 500;
      return new NextResponse(null, { status });
    }
    return new NextResponse(null, { status: 500 });
  }
}