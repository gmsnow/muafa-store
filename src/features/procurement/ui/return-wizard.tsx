"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { VoiceInput } from "@/components/voice-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { Dictionary } from "@/shared/i18n";
import {
  purchaseListAction, purchaseForReturnAction, createPurchaseReturnAction,
} from "../actions";

interface RetRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  nameAr: string | null;
  purchased: string;
  alreadyReturned: string;
  maxReturnable: string;
  unitCost: string;
}

export function PurchaseReturnWizard({
  t, tCommon, tErrors, tSales, tProducts,
}: {
  t: Dictionary["procurement"];
  tSales: Dictionary["sales"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tProducts: Dictionary["products"];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<RetRow[] | null>(null);
  const [purchaseId, setPurchaseId] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [refundMethod, setRefundMethod] = useState<"CASH" | "CREDIT">("CASH");
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    setBusy(true);
    const res = await purchaseForReturnAction(id);
    setBusy(false);
    if (res.ok) {
      const d = res.data as { id: string; items: RetRow[] };
      setPurchaseId(d.id);
      setRows(d.items.filter((i) => new Decimal(i.maxReturnable).gt(0)));
      setQty({});
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  async function find() {
    if (!query.trim()) return;
    const res = await purchaseListAction(query);
    if (res.ok) {
      const list = res.data as { rows: { id: string; purchaseNumber: string }[] };
      const match =
        list.rows.find((r) => r.purchaseNumber.toLowerCase() === query.trim().toLowerCase()) ??
        list.rows[0];
      if (!match) return toast.error(tCommon.noData);
      await load(match.id);
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("purchase");
    if (!pid) return;
    const handle = setTimeout(() => { void load(pid); }, 0);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refundTotal = (rows ?? []).reduce(
    (acc, r) => acc.plus(new Decimal(r.unitCost).mul(Number(qty[r.productId]) || 0)),
    new Decimal(0),
  );

  async function submit() {
    if (!purchaseId || !rows) return;
    const items = rows
      .map((r) => ({ productId: r.productId, quantity: Number(qty[r.productId]) || 0, unitCost: Number(r.unitCost) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0 || reason.trim().length < 3) return toast.error(tCommon.errorTitle);
    setBusy(true);
    const res = await createPurchaseReturnAction({
      purchaseId, items, reason, restock: true, refundMethod,
    });
    setBusy(false);
    if (res.ok) {
      const d = res.data as { returnNumber: string };
      toast.success(t.purchaseReturnOk.replace("{number}", d.returnNumber));
      router.push("/procurement/returns");
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex gap-2 pt-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void find(); }}
            placeholder={`${t.findPurchase} (PUR-…)`}
            dir="ltr"
          />
          <Button onClick={() => void find()} disabled={busy}>{tCommon.confirm}</Button>
        </CardContent>
      </Card>

      {rows && (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>{tProducts.name}</TableHead>
                  <TableHead className="text-end">{t.returnable}</TableHead>
                  <TableHead className="w-24 text-end">{tCommon.quantity}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs" dir="ltr">{r.sku}</TableCell>
                    <TableCell className="text-sm font-medium">{r.nameAr ?? r.name}</TableCell>
                    <TableCell className="text-end tabular-nums" dir="ltr">{r.maxReturnable}</TableCell>
                    <TableCell>
                      <Input type="number" min="0" max={Number(r.maxReturnable)} step="any"
                        dir="ltr" className="h-8 text-end" placeholder="0"
                        value={qty[r.productId] ?? ""}
                        onChange={(e) => setQty((q) => ({ ...q, [r.productId]: e.target.value }))} />
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="h-16 text-center text-muted-foreground">{tCommon.noData}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>

            <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{tSales.returnReason}</Label>
                <VoiceInput value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} required />
              </div>
              <div className="space-y-1">
                <Label>{tSales.refundMethod}</Label>
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as "CASH" | "CREDIT")}
                >
                  <option value="CASH">{t.cashRefund}</option>
                  <option value="CREDIT">{t.creditNote}</option>
                </select>
              </div>
              <div className="space-y-1 text-end">
                <Label>{tCommon.total}</Label>
                <p className="text-lg font-bold tabular-nums" dir="ltr">{refundTotal.toFixed(2)}</p>
              </div>
            </div>

            <Button onClick={() => void submit()} disabled={busy} className="w-full">
              {busy ? tCommon.saving : t.newPurchaseReturn}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
