import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getT } from "@/shared/i18n";
import { ExportCsvButton } from "@/features/inventory/ui/export-csv-button";
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
  const { t } = await getT();
  const exportAction = exportReportAction.bind(null, family, fromISO, toISO);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <ExportCsvButton action={exportAction} filename={`${family}-report`} label={t.common.export} />
          <PdfActions
            targetId="pdf-paper"
            fileName={`${family}-report_${fromISO}_to_${toISO}`}
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
