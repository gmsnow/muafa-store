"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { VoiceInput } from "@/components/voice-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Dictionary } from "@/shared/i18n";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { createSaleReturnAction, saleByInvoiceAction } from "../actions";

interface SaleLine {
  id: string;
  sku: string;
  productName: string;
  productNameAr: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  returned: number;
}

interface FoundSale {
  id: string;
  invoiceNumber: string;
  saleDate: string;
  status: string;
  total: number;
  lines: SaleLine[];
}

export function ReturnWizard({
  t, tErrors, locale,
}: {
  t: Dictionary["sales"];
  tErrors: Dictionary["errors"];
  locale: string;
}) {
  const router = useRouter();
  const [invoiceNo, setInvoiceNo] = useState("");
  const [sale, setSale] = useState<FoundSale | null>(null);
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [refundMethod, setRefundMethod] = useState<"CASH" | "CREDIT">("CASH");
  const [busy, setBusy] = useState(false);

  async function find() {
    if (!invoiceNo.trim()) return;
    const res = await saleByInvoiceAction(invoiceNo.trim());
    if (!res.ok) {
      toast.error(res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = res.data as any;
    const lines: SaleLine[] = (s.items ?? []).map((item: Record<string, string>) => ({
      id: item.id,
      sku: item.sku,
      productName: item.productName,
      productNameAr: item.productNameAr,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      returned: 0,
    }));
    setSale({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      saleDate: s.saleDate,
      status: s.status as string,
      total: D(s.total).toNumber(),
      lines,
    });
    setQtys({});
  }

  function changeQty(lineId: string, value: number) {
    setQtys((prev) => ({ ...prev, [lineId]: Math.max(0, value) }));
  }

  async function submit() {
    if (!sale || busy) return;
    const items = Object.entries(qtys)
      .filter(([, q]) => q > 0)
      .map(([saleItemId, q]) => ({ saleItemId, quantity: q }));
    if (items.length === 0 || reason.trim().length < 3) {
      toast.error(tErrors.VALIDATION_ERROR);
      return;
    }
    setBusy(true);
    const res = await createSaleReturnAction({
      saleId: sale.id, items, reason: reason.trim(), restock, refundMethod,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(t.returnCompleted.replace("{number}", res.data.returnNumber));
      setSale(null);
      setInvoiceNo("");
      setReason("");
      router.refresh();
    } else {
      toast.error(res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message);
    }
  }

  const refundTotal =
    sale?.lines.reduce((a, l) => a + (qtys[l.id] || 0) * D(l.unitPrice).toNumber(), 0) ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{t.findInvoice}</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void find()}
            placeholder="INV-000001"
            dir="ltr"
            className="w-56 font-mono"
          />
          <Button onClick={find} disabled={!invoiceNo.trim()}>
            <Search className="size-4" /> {t.findInvoice}
          </Button>
        </CardContent>
      </Card>

      {sale && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="font-mono text-base" dir="ltr">{sale.invoiceNumber}</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatDateTime(sale.saleDate, locale)}</span>
              <Badge variant={sale.status === "COMPLETED" ? "outline" : "secondary"}>{sale.status.replace("_", " ")}</Badge>
              <span>{formatMoney(sale.total, locale)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-end">Sold</TableHead>
                  <TableHead className="w-28">{t.returnQty}</TableHead>
                  <TableHead className="text-end">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sale.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs" dir="ltr">{l.sku}</TableCell>
                    <TableCell className="max-w-48 truncate text-sm">
                      {l.productNameAr ?? l.productName}
                    </TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{D(l.quantity).toNumber()}</TableCell>
                    <TableCell>
                      <Input
                        type="number" min="0" step="1" dir="ltr"
                        value={qtys[l.id] ?? ""}
                        onChange={(e) => changeQty(l.id, Number(e.target.value))}
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {formatMoney((qtys[l.id] || 0) * D(l.unitPrice).toNumber(), locale)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t.returnReason}</Label>
                <VoiceInput value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={300} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={restock} onCheckedChange={(v) => setRestock(v === true)} /> Restock
              </label>
              <div className="space-y-1.5">
                <Label>{t.refundMethod}</Label>
                <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as "CASH" | "CREDIT")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">{t.payCash}</SelectItem>
                    <SelectItem value="CREDIT">{t.payCredit}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">{t.refundMethod}</span>
              <span className="text-lg font-bold">{formatMoney(refundTotal, locale)}</span>
            </div>

            <Button className="w-full" size="lg" onClick={submit} disabled={busy || refundTotal <= 0 || reason.trim().length < 3}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t.returnTitle}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


