import { z } from "zod";

/** YYYY-MM-DD string or undefined */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date")
  .optional()
  .or(z.literal("").transform(() => undefined));

export const reportRangeSchema = z.object({
  from: day,
  to: day,
});

export type ReportRangeInput = z.infer<typeof reportRangeSchema>;

export interface ReportRange {
  /** inclusive lower bound, 00:00 local */
  from: Date;
  /** exclusive upper bound, 00:00 local of the day AFTER `to` */
  to: Date;
  fromISO: string;
  toISO: string;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Resolve a report date range from raw search params.
 * Defaults to month-to-date. `to` is inclusive on input, exclusive internally.
 */
export function parseReportRange(raw: unknown): ReportRange {
  const parsed = reportRangeSchema.safeParse(raw);
  const input = parsed.success ? parsed.data : {};
  const today = new Date();

  let from: Date;
  if (input.from) {
    const [y, m, d] = input.from.split("-").map(Number);
    from = new Date(y, m - 1, d);
  } else {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  let to: Date;
  if (input.to) {
    const [y, m, d] = input.to.split("-").map(Number);
    to = new Date(y, m - 1, d + 1); // exclusive upper bound
  } else {
    to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  }

  if (from > to) [from, to] = [to, from];
  return { from, to, fromISO: isoDay(from), toISO: isoDay(new Date(to.getTime() - 86400000)) };
}

export const REPORT_FAMILIES = [
  "sales", "purchases", "profit", "inventory",
  "customers", "suppliers", "expenses",
] as const;

export type ReportFamily = (typeof REPORT_FAMILIES)[number];

export function isReportFamily(v: string): v is ReportFamily {
  return (REPORT_FAMILIES as readonly string[]).includes(v);
}
