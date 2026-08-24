"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Dictionary } from "@/shared/i18n";
import { importProductsAction } from "../actions";
import type { ImportReport } from "../service";

const SAMPLE = "sku,name,nameAr,category,brand,unit,costPrice,sellingPrice,minStock,barcode\n" +
  "IMP-001,Rice 5kg,أرز ٥كغ,Pantry,Abu Kass,piece,8500,9900,10,1234567890";

export function ProductImportDialog({ t, tCommon }: { t: Dictionary["products"]; tCommon: Dictionary["common"] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function run() {
    if (!csv.trim()) return;
    setBusy(true);
    const res = await importProductsAction(csv);
    setBusy(false);
    if (res.ok) {
      setReport(res.data);
      router.refresh();
      if (res.data.errors.length === 0) {
        toast.success(`${res.data.imported} imported`);
      }
    } else {
      toast.error(res.error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setReport(null); } }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileUp className="size-4" /> {tCommon.import}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.importTitle}</DialogTitle>
          <DialogDescription>{t.importHint}</DialogDescription>
        </DialogHeader>

        {!report ? (
          <>
            <textarea
              dir="ltr"
              className="h-48 w-full rounded-md border bg-background p-3 font-mono text-xs"
              placeholder={SAMPLE}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.importSample}</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCsv(SAMPLE)}>{t.importSampleBtn}</Button>
              <Button onClick={run} disabled={busy || !csv.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {tCommon.import}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="rounded-md bg-muted px-3 py-1.5">{report.totalRows} rows</span>
              <span className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-emerald-700 dark:text-emerald-400">
                ✓ {report.imported} ok
              </span>
              <span className={`rounded-md px-3 py-1.5 ${report.errors.length > 0 ? "bg-destructive/15 text-destructive" : "bg-muted"}`}>
                ✕ {report.errors.length} failed
              </span>
            </div>
            {report.errors.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Row</TableHead>
                      <TableHead>Problem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.errors.map((e) => (
                      <TableRow key={e.row}>
                        <TableCell className="font-mono text-xs">{e.row}</TableCell>
                        <TableCell className="text-xs text-destructive">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>{tCommon.close}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
