/** Client-safe formatting helpers (Arabic). */

const AR = "ar-YE-u-nu-latn";

export function formatMoney(value: number | string | null | undefined, _locale?: string): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const formatted = new Intl.NumberFormat(AR, {
    maximumFractionDigits: safe >= 1000 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(safe);
  return `${formatted} ر.ي`;
}

export function formatNumber(value: number | string | null | undefined, _locale?: string): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat(AR).format(Number.isFinite(n) ? n : 0);
}

export function formatPercent(value: number, _locale?: string): string {
  const formatted = new Intl.NumberFormat(AR, { maximumFractionDigits: 1 }).format(value);
  return `${value >= 0 ? "+" : ""}${formatted}%`;
}

export function formatDate(value: Date | string, _locale?: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(AR, {
    year: "numeric", month: "short", day: "numeric",
  }).format(d);
}

export function formatDateTime(value: Date | string, _locale?: string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(AR, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}
