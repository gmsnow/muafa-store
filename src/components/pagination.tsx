import Link from "next/link";

/** Server-rendered pagination driven by URL search params (?page=N). */
export function Pagination({
  page,
  pageSize,
  total,
  baseParams,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  baseParams: Record<string, string | undefined>;
  labels: { previous: string; next: string; page: string; of: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(baseParams)) {
      if (v !== undefined && v !== "" && k !== "page") sp.set(k, v);
    }
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm">
      <p className="text-muted-foreground" dir="ltr">
        {from}–{to} / {total.toLocaleString("en-US")}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {labels.page} {page} {labels.of} {pages}
        </span>
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            className="rounded-md border px-3 py-1.5 hover:bg-accent"
            scroll={false}
          >
            {labels.previous}
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-1.5 opacity-40">{labels.previous}</span>
        )}
        {page < pages ? (
          <Link
            href={href(page + 1)}
            className="rounded-md border px-3 py-1.5 hover:bg-accent"
            scroll={false}
          >
            {labels.next}
          </Link>
        ) : (
          <span className="rounded-md border px-3 py-1.5 opacity-40">{labels.next}</span>
        )}
      </div>
    </div>
  );
}

export function clampPage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const DEFAULT_PAGE_SIZE = 25;

/** Next 16 typed searchParams may be arrays — normalize to the first value. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}
