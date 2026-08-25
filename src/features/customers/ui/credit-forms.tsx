"use client";
import { VoiceInput } from "@/components/voice-input";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Dictionary } from "@/shared/i18n";
import { recordCustomerTxnAction, adjustLoyaltyAction, saveGroupAction } from "../actions";
import { enqueue } from "@/shared/offline/outbox";

interface CustomerOpt { id: string; name: string; nameAr: string | null; balance?: string; loyaltyPoints?: string }

function err(tErrors: Dictionary["errors"], code: string, message: string) {
  return code in tErrors ? tErrors[code as keyof typeof tErrors] : message;
}

export function CustomerTxnDialog({
  tCommon, tErrors, tCustomers, open, onOpenChange,
  customers, defaultCustomerId,
}: {
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tCustomers: Dictionary["customers"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: CustomerOpt[];
  defaultCustomerId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"PAYMENT" | "DEBT">("PAYMENT");

  async function submit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    const payload = { ...raw, type };

    // Offline (or request failed): queue locally, replayed automatically later.
    const saveOffline = async () => {
      await enqueue("CUSTOMER_TXN", payload);
      toast.success(tCustomers.offlineSaved);
      onOpenChange(false);
    };
    if (!navigator.onLine) {
      await saveOffline();
      setBusy(false);
      return;
    }

    let res;
    try {
      res = await recordCustomerTxnAction(payload);
    } catch {
      await saveOffline();
      setBusy(false);
      return;
    }
    setBusy(false);
    if (res.ok) {
      toast.success(tCustomers.paymentRecorded);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(err(tErrors, res.error.code, res.error.message));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{type === "PAYMENT" ? tCustomers.addPayment : tCustomers.recordDebt}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>{tCustomers.title}</Label>
            <select name="customerId" required defaultValue={defaultCustomerId ?? ""}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.nameAr ?? c.name}{c.balance ? ` — ${c.balance}` : ""}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={type === "PAYMENT" ? "default" : "outline"}
              onClick={() => setType("PAYMENT")}>{tCustomers.addPayment}</Button>
            <Button type="button" variant={type === "DEBT" ? "default" : "outline"}
              onClick={() => setType("DEBT")}>{tCustomers.recordDebt}</Button>
          </div>
          <div className="space-y-1">
            <Label>{tCustomers.paymentAmount}</Label>
            <Input name="amount" type="number" min="0.01" step="0.01" dir="ltr" required autoFocus />
          </div>
          <div className="space-y-1">
            <Label>{tCommon.notes}</Label>
            <VoiceInput name="note" maxLength={300} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {tCommon.cancel}
            </Button>
            <Button type="submit" disabled={busy}>{busy ? tCommon.saving : tCommon.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LoyaltyAdjustDialog({
  tCommon, tErrors, tCustomers, open, onOpenChange,
  customers, defaultCustomerId,
}: {
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tCustomers: Dictionary["customers"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: CustomerOpt[];
  defaultCustomerId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"REDEEM" | "ADJUST">("REDEEM");

  async function submit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    const res = await adjustLoyaltyAction({ ...raw, mode });
    setBusy(false);
    if (res.ok) {
      toast.success(tCommon.save);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(err(tErrors, res.error.code, res.error.message));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === "REDEEM" ? tCustomers.redeemPoints : tCustomers.adjustPoints}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>{tCustomers.title}</Label>
            <select name="customerId" required defaultValue={defaultCustomerId ?? ""}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr ?? c.name}{c.loyaltyPoints ? ` (${c.loyaltyPoints} ${tCustomers.loyaltyPoints})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={mode === "REDEEM" ? "default" : "outline"}
              onClick={() => setMode("REDEEM")}>{tCustomers.redeemPoints}</Button>
            <Button type="button" variant={mode === "ADJUST" ? "default" : "outline"}
              onClick={() => setMode("ADJUST")}>{tCustomers.adjustPoints}</Button>
          </div>
          <div className="space-y-1">
            <Label>{mode === "ADJUST" ? `${tCustomers.adjustPoints} (±)` : tCustomers.redeemPoints}</Label>
            <Input name="points" type="number" step="0.01" dir="ltr" required autoFocus
              placeholder={mode === "ADJUST" ? "-5 or +10" : "0"} />
          </div>
          <div className="space-y-1">
            <Label>{tCommon.notes}</Label>
            <VoiceInput name="note" maxLength={300} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {tCommon.cancel}
            </Button>
            <Button type="submit" disabled={busy}>{busy ? tCommon.saving : tCommon.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GroupFormDialog({
  tCommon, tErrors, tCustomers, open, onOpenChange, group,
}: {
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tCustomers: Dictionary["customers"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group?: { id: string; name: string; nameAr: string | null; description: string | null; discountRate: string; priceMode: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    if (!String(raw.nameAr ?? "").trim() && group?.name) raw.name = group.name;
    else raw.name = raw.nameAr;
    const res = await saveGroupAction(group?.id ?? null, raw);
    setBusy(false);
    if (res.ok) {
      toast.success(tCommon.save);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(err(tErrors, res.error.code, res.error.message));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{group ? tCommon.edit : tCommon.create}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>الاسم</Label>
              <VoiceInput name="nameAr" dir="rtl" required minLength={2} defaultValue={group?.nameAr ?? group?.name ?? ""} />
            </div>
            <div className="space-y-1">
              <Label>{tCustomers.discountRate}</Label>
              <Input name="discountRate" type="number" min="0" max="100" step="0.01" dir="ltr"
                defaultValue={group?.discountRate ?? "0"} />
            </div>
            <div className="space-y-1">
              <Label>{tCustomers.priceMode}</Label>
              <select name="priceMode" defaultValue={group?.priceMode ?? "retail"}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                <option value="retail">{tCustomers.retail}</option>
                <option value="wholesale">{tCustomers.wholesale}</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>{tCommon.notes}</Label>
            <VoiceInput name="description" maxLength={300} defaultValue={group?.description ?? ""} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {tCommon.cancel}
            </Button>
            <Button type="submit" disabled={busy}>{busy ? tCommon.saving : tCommon.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
