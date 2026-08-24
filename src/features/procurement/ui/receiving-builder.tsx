"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VoiceInput } from "@/components/voice-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Dictionary } from "@/shared/i18n";
import { receivePurchaseAction } from "../actions";
import { ProductPicker, type PickRow } from "./product-picker";

interface RLine {
  productId: string;
  sku: string;
  name: string;
  unitSymbol: string;
  quantity: number;
  unitCost: number;
  discount: number;
  batchNo: string;
  mfgDate: string;
  expDate: string;
}

export function ReceivingBuilder({
  t, tCommon, tErrors, tProducts, tStock, suppliers, lockedSupplierId, poId,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tProducts: Dictionary["products"];
  tStock: Dictionary["stock"];
  suppliers: { id: string; name: string; nameAr: string | null }[];
  /** Set when receiving against a specific PO — supplier + lines come preloaded. */
  lockedSupplierId?: string;
  poId?: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(lockedSupplierId ?? "");
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RLine[]>([]);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    let subtotal = new Decimal(0);
    let discountTotal = new Decimal(0);
    for (const l of lines) {
      const gross = new Decimal(l.unitCost || 0).mul(l.quantity);
      subtotal = subtotal.plus(gross);
      discountTotal = discountTotal.plus(l.discount || 0);
    }
    const total = subtotal.minus(discountTotal);
    return { total, due: total.minus(Number(paidAmount) || 0) };
  }, [lines, paidAmount]);

  function addLine(p: PickRow) {
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((ls) => [
      ...ls,
      {
        productId: p.id, sku: p.sku, name: p.nameAr ?? p.name, unitSymbol: p.unitSymbol,
        quantity: 1, unitCost: Number(p.costPrice), discount: 0,
        batchNo: "", mfgDate: "", expDate: "",
      },
    ]);
  }

  function patch(productId: string, field: keyof RLine, value: string) {
    setLines((ls) =>
      ls.map((l) =>
        l.productId === productId
          ? {
              ...l,
              [field]:
                field === "quantity" || field === "unitCost" || field === "discount"
                  ? Number(value) || 0
                  : value,
            }
          : l,
      ),
    );
  }

  async function submit() {
    if (!supplierId) return toast.error(t.selectSupplier);
    if (lines.length === 0) return toast.error(tCommon.noData);
    setBusy(true);
    const res = await receivePurchaseAction({
      supplierId,
      purchaseOrderId: poId ?? "",
      paidAmount: Number(paidAmount) || 0,
      notes,
      items: lines.map((l) => ({
        productId: l.productId, quantity: l.quantity, unitCost: l.unitCost,
        discount: l.discount,
        batchNo: l.batchNo, mfgDate: l.mfgDate, expDate: l.expDate,
      })),
    });
    setBusy(false);
    if (res.ok) {
      const d = res.data as { purchaseNumber: string };
      toast.success(`${t.receivedOk} (${d.purchaseNumber})`);
      router.push("/procurement/purchases");
    } else {
      toast.error(res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>{t.suppliersTitle}</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={supplierId}
              disabled={Boolean(lockedSupplierId)}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">— {t.selectSupplier} —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.nameAr ?? s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t.paidAmount}</Label>
            <Input type="number" min="0" step="0.01" dir="ltr"
              value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{tCommon.notes}</Label>
            <VoiceInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">{poId ? t.receivingTitle : t.directPurchase}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {!poId && <ProductPicker onPick={addLine} />}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tProducts.name}</TableHead>
                <TableHead className="w-20 text-end">{tCommon.quantity}</TableHead>
                <TableHead className="w-24 text-end">{tCommon.unitPrice}</TableHead>
                <TableHead className="w-24">{tStock.batchNo}</TableHead>
                <TableHead className="w-32">{t.batchInfo}</TableHead>
                <TableHead className="w-28 text-end">{tCommon.total}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.productId}>
                  <TableCell>
                    <p className="text-sm font-medium">{l.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{l.sku}</p>
                  </TableCell>
                  <TableCell>
                    <Input type="number" min="0" step="any" dir="ltr" className="h-8 text-end"
                      value={l.quantity} onChange={(e) => patch(l.productId, "quantity", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" min="0" step="0.01" dir="ltr" className="h-8 text-end"
                      value={l.unitCost} onChange={(e) => patch(l.productId, "unitCost", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input dir="ltr" className="h-8" value={l.batchNo}
                      onChange={(e) => patch(l.productId, "batchNo", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Input type="date" title={tStock.mfgDate} className="h-8 text-xs"
                        value={l.mfgDate} onChange={(e) => patch(l.productId, "mfgDate", e.target.value)} />
                      <Input type="date" title={tStock.expiryDate} className="h-8 text-xs"
                        value={l.expDate} onChange={(e) => patch(l.productId, "expDate", e.target.value)} />
                    </div>
                  </TableCell>
                  <TableCell className="text-end tabular-nums" dir="ltr">
                    {new Decimal(l.unitCost || 0).mul(l.quantity).minus(l.discount || 0).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-destructive"
                      onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}>
                      ✕
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={7} className="h-20 text-center text-muted-foreground">{tCommon.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="space-y-0.5 text-sm" dir="ltr">
              <p className="font-bold">{totals.total.toFixed(2)}</p>
              <p className="text-muted-foreground">{t.dueAmount}: {totals.due.toFixed(2)}</p>
            </div>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? tCommon.loading : t.receive}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
