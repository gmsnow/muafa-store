/** Route-level fallback shown inside <main> while a page streams in.
 * Sidebar/topbar remain mounted, so this only fills the content area. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border bg-card" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-lg border bg-card lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-lg border bg-card" />
      </div>
    </div>
  );
}
