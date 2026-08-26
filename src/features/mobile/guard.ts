import { NextResponse } from "next/server";
import { ok, fail, AppError } from "@/shared/core/api-response";
import { logger } from "@/shared/core/logger";

/**
 * Wraps a mobile route handler: catches AppError, ZodError, and unknown errors,
 * returning the standard `{ ok, data }` / `{ ok, error }` JSON envelope.
 */
export async function mobileGuard<T>(
  fn: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(ok(data));
  } catch (err) {
    if (err instanceof AppError) {
      logger.warn("mobile_app_error", { code: err.code, message: err.message });
      return NextResponse.json(fail(err.code, err.message, err.fields), { status: errHttpCode(err.code) });
    }
    if (
      typeof err === "object" &&
      err !== null &&
      "issues" in err &&
      Array.isArray((err as { issues: unknown }).issues)
    ) {
      const fields: Record<string, string[]> = {};
      for (const issue of (err as { issues: { path: PropertyKey[]; message: string }[] }).issues) {
        const key = issue.path.map(String).join(".") || "_";
        (fields[key] ??= []).push(issue.message);
      }
      return NextResponse.json(fail("VALIDATION_ERROR", "Invalid input", fields), { status: 400 });
    }
    logger.error("mobile_unhandled_error", err);
    return NextResponse.json(
      fail("INTERNAL_ERROR", "Unexpected error occurred"),
      { status: 500 },
    );
  }
}

function errHttpCode(code: string): number {
  switch (code) {
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "VALIDATION_ERROR": return 400;
    case "DUPLICATE": return 409;
    case "INSUFFICIENT_STOCK": return 409;
    case "IN_USE": return 409;
    case "CREDIT_LIMIT_EXCEEDED": return 400;
    default: return 400;
  }
}
