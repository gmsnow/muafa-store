"use client";
import { VoiceInput } from "@/components/voice-input";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Dictionary } from "@/shared/i18n";
import { createAdjustmentAction } from "../actions";

interface ProductOpt {
  id: string;
  sku: string;
  name: string;
  nameAr?: string | null;
  quantity: number;
}

export function AdjustmentForm({
  t, tCommon, tStock, tErrors, products,
}: {
  t: Dictionary["products"];
  tCommon: Dictionary["common"];
  tStock: Dictionary["stock"];
  tErrors: Dictionary["errors"];
  products: ProductOpt[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [type, setType] = useState<"INCREASE" | "DECREASE">("INCREASE");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => products.find((p) => p.id === productId), [products, productId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId || !Number(quantity) || reason.trim().length < 3) return;
    setBusy(true);
    const res = await createAdjustmentAction({
      productId, type, quantity: Number(quantity), reason: reason.trim(), note,
    });
    setBusy(false);
    if (res.ok) {
      toast.success(`${tStock.adjustedOk} — ${res.data.adjustmentNumber}`);
      setQuantity(""); setReason(""); setNote("");
      router.refresh();
    } else {
      const msg = res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message;
      toast.error(msg);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{tStock.adjustTitle}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t.name}</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {`${p.nameAr || p.name} — ${p.sku}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-xs text-muted-foreground" dir="ltr">
                {tStock.available}: {selected.quantity}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{tStock.adjustmentType}</Label>
            <Select value={type} onValueChange={(v) => setType(v as "INCREASE" | "DECREASE")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INCREASE">{tStock.increase}</SelectItem>
                <SelectItem value="DECREASE">{tStock.decrease}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{tCommon.quantity}</Label>
            <Input type="number" step="0.001" min="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} dir="ltr" required />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tStock.reason}</Label>
            <VoiceInput value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={300} />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{tCommon.notes}</Label>
            <VoiceInput value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>

          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !productId || !Number(quantity)}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {tCommon.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
