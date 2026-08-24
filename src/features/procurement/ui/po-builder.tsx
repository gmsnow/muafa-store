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
import { createPurchaseOrderAction } from "../actions";
import { ProductPicker, type PickRow } from "./product-picker";

interface Line {
  productId: string;
  sku: string;
  name: string;
  unitSymbol: string;
  quantity: number;
  unitCost: number;
  discount: number;
}

const D0 = (v: number) => new Decimal(v || 0);

export function PoBuilder({
  t, tCommon, tErrors, tProducts, suppliers,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tProducts: Dictionary["products"];
  suppliers: { id: string; name: string; nameAr: string | null }[];
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const totals = useMemo(() => {
    let subtotal = new Decimal(0);
    let discountTotal = new Decimal(0);
    for (const l of lines) {
      const gross = D0(l.unitCost).mul(l.quantity);
      subtotal = subtotal.plus(gross);
      discountTotal = discountTotal.plus(D0(l.discount));
    }
    return { subtotal, discountTotal, total: subtotal.minus(discountTotal) };
  }, [lines]);

  function addLine(p: PickRow) {
    if (lines.some((l) => l.productId === p.id)) return;
    setLines((ls) => [
      ...ls,
      {
        productId: p.id, sku: p.sku, name: p.nameAr ?? p.name, unitSymbol: p.unitSymbol,
        quantity: 1, unitCost: Number(p.costPrice), discount: 0,
      },
    ]);
  }

  function patch(productId: string, field: keyof Line, value: string) {
    setLines((ls) =>
      ls.map((l) => (l.productId === productId ? { ...l, [field]: Number(value) || 0 } : l)),
    );
  }

  async function submit() {
    if (!supplierId) return toast.error(t.selectSupplier);
    if (lines.length === 0) return toast.error(tCommon.noData);
    setBusy(true);
    const res = await createPurchaseOrderAction({
      supplierId,
      expectedDate,
      notes,
      items: lines.map((l) => ({
        productId: l.productId, quantity: l.quantity, unitCost: l.unitCost,
        discount: l.discount,
      })),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(t.poCreated);
      router.push("/procurement/purchase-orders");
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
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">— {t.selectSupplier} —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.nameAr ?? s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>{t.expectedDate}</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{tCommon.notes}</Label>
            <VoiceInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">{t.addItem}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <ProductPicker onPick={addLine} />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tProducts.name}</TableHead>
                <TableHead className="w-24 text-end">{tCommon.quantity}</TableHead>
                <TableHead className="w-28 text-end">{tCommon.unitPrice}</TableHead>
                <TableHead className="w-24 text-end">{tCommon.discount}</TableHead>
                <TableHead className="w-28 text-end">{tCommon.total}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => {
                const net = D0(l.unitCost).mul(l.quantity).minus(D0(l.discount));
                const rowTotal = net;
                return (
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
                      <Input type="number" min="0" step="0.01" dir="ltr" className="h-8 text-end"
                        value={l.discount} onChange={(e) => patch(l.productId, "discount", e.target.value)} />
                    </TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{rowTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="text-destructive"
                        onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}>
                        ✕
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{tCommon.noData}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="space-y-0.5 text-sm" dir="ltr">
              <p className="text-muted-foreground">
                Subtotal {totals.subtotal.toFixed(2)} − Disc {totals.discountTotal.toFixed(2)}
              </p>
              <p className="text-lg font-bold">{totals.total.toFixed(2)}</p>
            </div>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? tCommon.saving : t.newPo}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
