import { TriangleAlert } from "lucide-react";
import { logger } from "@/shared/core/logger";
import { ReloadButton } from "./reload-button";

function sanitizeMessage(message: string): string {
  // Never leak connection credentials onto the screen or into logs.
  const redacted = message.replace(/(:\/\/[^:@/]+):[^@/]+@/g, "$1:***@");
  return redacted.length > 300 ? `${redacted.slice(0, 300)}…` : redacted;
}

function SectionErrorCard({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex items-center gap-3">
        <TriangleAlert className="size-4 shrink-0 text-destructive" />
        <p className="text-muted-foreground">تعذّر تحميل هذا القسم</p>
        <ReloadButton />
      </div>
      {message && (
        <p dir="ltr" className="break-all rounded-md bg-muted/50 p-2 font-mono text-xs text-muted-foreground/80">
          {sanitizeMessage(message)}
        </p>
      )}
    </div>
  );
}

/**
 * Server-side guard for streamed sections. Renders the section by calling the
 * async render function; if it throws (DB hiccup, transient pool timeout) the
 * error is logged and a compact card streams in its place, so one failing
 * section can never abort the whole page or a client-side navigation.
 */
export async function SafeSection({ run, name }: { run: () => Promise<unknown>; name: string }) {
  try {
    return (await run()) as React.ReactNode;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err ?? "unknown");
    logger.error("section_failed", err, { name });
    return <SectionErrorCard message={message} />;
  }
}