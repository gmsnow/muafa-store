"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import { payPurchaseAction } from "@/features/procurement/actions";

export function PayPurchaseDialog({
  t, tCommon, tErrors, purchaseId, dueAmount,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  purchaseId: string;
  dueAmount: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(dueAmount);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    const res = await payPurchaseAction({ purchaseId, amount: Number(amount), method: "CASH" });
    setBusy(false);
    if (res.ok) {
      toast.success(t.payOk);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} dir="ltr">
        {t.payPurchase}
      </Button>
    );
  }
  return (
    <span className="inline-flex gap-1">
      <Input type="number" min="0" step="0.01" dir="ltr" className="h-8 w-24 text-end"
        value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      <Button size="sm" onClick={() => void pay()} disabled={busy}>{tCommon.confirm}</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>✕</Button>
    </span>
  );
}
