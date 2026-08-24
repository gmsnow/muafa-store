"use client";
import { VoiceInput, VoiceTextarea } from "@/components/voice-input";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import { saveCustomerAction, customerEditAction, deleteCustomerAction } from "../actions";

interface EditTarget {
  id: string; name: string; nameAr: string | null; phone: string | null;
  email: string | null; address: string | null; groupId: string;
  creditLimit: string; notes: string | null;
}

function InnerForm({
  t, tCommon, tErrors, tCustomers, editId, close,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tCustomers: Dictionary["customers"];
  editId: string | null;
  close: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditTarget | null>(null);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    void customerEditAction(editId).then((res) => {
      if (!alive) return;
      if (res.ok) setEdit(res.data as EditTarget);
      else toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    });
    return () => { alive = false; };
  }, [editId, tErrors]);

  async function submit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    if (!String(raw.nameAr ?? "").trim() && edit?.name) raw.name = edit.name;
    else raw.name = raw.nameAr;
    const res = await saveCustomerAction(editId ?? null, raw);
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? tCommon.save : tCommon.create);
      close();
      router.refresh();
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  async function remove() {
    if (!editId) return;
    setBusy(true);
    const res = await deleteCustomerAction(editId);
    setBusy(false);
    if (res.ok) {
      toast.success(tCommon.delete);
      close();
      router.refresh();
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  return (
    <form action={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>الاسم</Label>
          <VoiceInput name="nameAr" dir="rtl" required minLength={2} defaultValue={edit?.nameAr ?? edit?.name ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{t.phone}</Label>
          <VoiceInput name="phone" dir="ltr" defaultValue={edit?.phone ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{tCustomers.creditLimit}</Label>
          <Input name="creditLimit" type="number" min="0" step="0.01" dir="ltr"
            defaultValue={edit?.creditLimit ?? "0"} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{tCommon.notes}</Label>
        <VoiceTextarea name="notes" rows={2} defaultValue={edit?.notes ?? ""} />
      </div>
      <DialogFooter className="gap-2">
        {editId && (
          <Button type="button" variant="destructive" onClick={() => void remove()} disabled={busy}>
            {tCommon.delete}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={close} disabled={busy}>{tCommon.cancel}</Button>
        <Button type="submit" disabled={busy}>{busy ? tCommon.saving : tCommon.save}</Button>
      </DialogFooter>
    </form>
  );
}

export function CustomerForm({
  t, tCommon, tErrors, tCustomers, open, onOpenChange, editId = null,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  tCustomers: Dictionary["customers"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editId ? tCommon.edit : tCommon.create}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {open && (
          <InnerForm
            key={editId ?? "new"}
            t={t} tCommon={tCommon} tErrors={tErrors} tCustomers={tCustomers}
            editId={editId}
            close={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
