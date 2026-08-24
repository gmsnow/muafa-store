/**
 * Minimal asynchronous logger (Protocol 4 — Safe Logging):
 * - fire-and-forget console output, never blocks or awaits
 * - basic levels only: debug | info | warn | error
 * - redacts sensitive keys so passwords/tokens never reach logs
 */
type Level = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = /password|passwd|secret|token|hash|authorization|cookie/i;
const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = process.env.NODE_ENV === "production" ? "info" : "debug";

function sanitize(meta: unknown, depth = 0): unknown {
  if (depth > 4 || meta === null || typeof meta !== "object") return meta;
  if (Array.isArray(meta)) return meta.map((m) => sanitize(m, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.test(k) ? "[REDACTED]" : sanitize(v, depth + 1);
  }
  return out;
}

function write(level: Level, event: string, meta?: unknown) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const entry = { ts: new Date().toISOString(), level, event, ...(meta ? { meta: sanitize(meta) } : {}) };
  (console[level === "debug" ? "log" : level] as (...a: unknown[]) => void)(
    JSON.stringify(entry),
  );
}

export const logger = {
  debug: (event: string, meta?: unknown) => write("debug", event, meta),
  info: (event: string, meta?: unknown) => write("info", event, meta),
  warn: (event: string, meta?: unknown) => write("warn", event, meta),
  error: (event: string, err: unknown, meta?: unknown) => {
    const detail =
      err instanceof Error
        ? { name: err.name, message: err.message }
        : { message: String(err ?? "unknown") };
    write("error", event, { ...detail, ...(meta as object | undefined) });
  },
};

