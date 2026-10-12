import { TriangleAlert } from "lucide-react";
import { logger } from "@/shared/core/logger";
import { ReloadButton } from "./reload-button";

function SectionErrorCard() {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm">
      <TriangleAlert className="size-4 shrink-0 text-destructive" />
      <p className="text-muted-foreground">تعذّر تحميل هذا القسم</p>
      <ReloadButton />
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
    logger.error("section_failed", err, { name });
    return <SectionErrorCard />;
  }
}