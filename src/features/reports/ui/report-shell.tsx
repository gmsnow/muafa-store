import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getT } from "@/shared/i18n";
import { getStoreSettings } from "@/features/settings/service";
import { formatDateTime, formatDate } from "@/shared/core/format";
import { Sprout, Clock, MoveHorizontal } from "lucide-react";
import { ExportButton } from "@/features/inventory/ui/export-csv-button";
import { exportReportAction } from "../actions";
import { PdfActions } from "@/components/pdf-actions";

/** Shared report page header: title, GET date-range filter, print + CSV export. */
export async function ReportHeader({
  title,
  basePath,
  family,
  fromISO,
  toISO,
}: {
  title: string;
  basePath: string;
  family: string;
  fromISO: string;
  toISO: string;
}) {
  const { t, locale } = await getT();
  const store = await getStoreSettings();
  const storeName = store?.nameAr ?? store?.name ?? "";
  const fromLabel = formatDate(fromISO, locale);
  const toLabel = formatDate(toISO, locale);
  const generatedAt = formatDateTime(new Date(), locale);
  const exportAction = exportReportAction.bind(null, family, fromISO, toISO);

  return (
    <div className="space-y-3">
      <div className="border-b pb-3">
        <p className="text-sm font-semibold text-primary">{storeName}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground print:[&_span]:text-black">
          <span className="inline-flex items-center gap-1.5">
            <Sprout className="size-3.5" />
            {t.reports.csv.period}: <bdi dir="ltr">{fromLabel} ← {toLabel}</bdi>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {t.reports.generatedAt}: <span dir="ltr">{generatedAt}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MoveHorizontal className="size-3.5" />
            {t.reports.direction}: {t.reports.rtl}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sr-only">{t.common.export}</h2>
        <div className="ms-auto flex flex-wrap items-center gap-2 print:hidden">
          <ExportButton action={exportAction} filename={`${family}-report`} label={t.common.export} />
          <PdfActions
            targetId="pdf-paper"
            fileName={`${family}-report_${fromISO}_to_${toISO}`}
            captureWidth={1280}
            decorate
            labels={{
              sharePdf: t.common.sharePdf,
              generatingPdf: t.common.generatingPdf,
              shareFailed: t.common.shareFailed,
            }}
          />
        </div>
      </div>
      <form method="GET" action={basePath} className="flex flex-wrap items-end gap-2 print:hidden">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.common.from}</label>
          <Input type="date" name="from" defaultValue={fromISO} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">{t.common.to}</label>
          <Input type="date" name="to" defaultValue={toISO} className="w-40" />
        </div>
        <Button type="submit" size="sm">{t.common.confirm}</Button>
        <Link href={basePath} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          {t.common.reset}
        </Link>
      </form>
    </div>
  );
}

export function SummaryCards({ items }: { items: { label: string; value: string; accent?: boolean }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label} className={s.accent ? "border-primary/40 bg-primary/5" : undefined}>
          <CardContent className="px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${s.accent ? "text-primary" : ""}`} dir="ltr">
              {s.value}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="px-0 pb-0">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
