import { logger } from "./logger";

/** Structured API/action result — every endpoint returns this shape. */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; fields?: Record<string, string[]> } };

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, fields?: Record<string, string[]>): ApiResult<never> {
  return { ok: false, error: { code, message, ...(fields ? { fields } : {}) } };
}

/** Business-rule error that is safe to show to end users. */
export class AppError extends Error {
  code: string;
  fields?: Record<string, string[]>;

  constructor(code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Wraps a server action / route handler body:
 * - AppError        → returned to client with its code/message
 * - ZodError-like   → VALIDATION_ERROR with field map
 * - anything else   → logged internally, generic message to client (no stack leaks)
 */
export async function guard<T>(fn: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) {
      logger.warn("app_error", { code: err.code, message: err.message });
      return fail(err.code, err.message, err.fields);
    }
    if (typeof err === "object" && err !== null && "issues" in err && Array.isArray((err as { issues: unknown }).issues)) {
      const fields: Record<string, string[]> = {};
      for (const issue of (err as { issues: { path: PropertyKey[]; message: string }[] }).issues) {
        const key = issue.path.map(String).join(".") || "_";
        (fields[key] ??= []).push(issue.message);
      }
      return fail("VALIDATION_ERROR", "Invalid input / بيانات غير صالحة", fields);
    }
    logger.error("unhandled_error", err);
    return fail("INTERNAL_ERROR", "Unexpected error occurred / حدث خطأ غير متوقع");
  }
}
