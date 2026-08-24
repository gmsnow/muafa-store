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
import { saveSupplierAction, supplierEditAction, deleteSupplierAction } from "../actions";

export interface SupplierFormTarget {
  id: string; name: string; nameAr: string | null; company: string | null;
  phone: string | null; email: string | null; address: string | null;
  creditLimit: string; paymentTerms: string | null;
  notes: string | null; isActive: boolean;
}

function InnerForm({
  t, tCommon, tErrors, editId, close,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  editId: string | null;
  close: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<SupplierFormTarget | null>(null);

  useEffect(() => {
    let alive = true;
    if (!editId) return;
    void supplierEditAction(editId).then((res) => {
      if (!alive) return;
      if (res.ok) setEdit(res.data as SupplierFormTarget);
      else toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    });
    return () => { alive = false; };
  }, [editId, tErrors]);

  function fail(res: { ok: false; error: { code: string; message: string } }) {
    toast.error(res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message);
  }

  async function onSubmit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    if (!String(raw.nameAr ?? "").trim() && edit?.name) raw.name = edit.name;
    else raw.name = raw.nameAr;
    const res = await saveSupplierAction(editId ?? null, raw);
    setBusy(false);
    if (res.ok) {
      toast.success(editId ? t.supplierUpdated : t.supplierCreated);
      close();
      router.refresh();
    } else {
      fail(res);
    }
  }

  async function onDelete() {
    if (!editId) return;
    setBusy(true);
    const res = await deleteSupplierAction(editId);
    setBusy(false);
    if (res.ok) {
      toast.success(t.supplierUpdated);
      close();
      router.refresh();
    } else {
      fail(res);
    }
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>الاسم</Label>
          <VoiceInput name="nameAr" dir="rtl" required minLength={2} defaultValue={edit?.nameAr ?? edit?.name ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{t.company}</Label>
          <VoiceInput name="company" defaultValue={edit?.company ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{t.phone}</Label>
          <VoiceInput name="phone" dir="ltr" defaultValue={edit?.phone ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{t.email}</Label>
          <Input name="email" type="email" dir="ltr" defaultValue={edit?.email ?? ""} />
        </div>
        <div className="space-y-1">
          <Label>{t.creditLimit}</Label>
          <Input name="creditLimit" type="number" step="0.01" min="0" dir="ltr"
            defaultValue={edit?.creditLimit ?? "0"} />
        </div>
        <div className="space-y-1">
          <Label>{t.paymentTerms}</Label>
          <VoiceInput name="paymentTerms" defaultValue={edit?.paymentTerms ?? ""} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t.address}</Label>
        <VoiceInput name="address" defaultValue={edit?.address ?? ""} />
      </div>
      <div className="space-y-1">
        <Label>{tCommon.notes}</Label>
        <VoiceTextarea name="notes" rows={2} defaultValue={edit?.notes ?? ""} />
      </div>
      <DialogFooter className="gap-2">
        {editId && (
          <Button type="button" variant="destructive" onClick={() => void onDelete()} disabled={busy}>
            {tCommon.delete}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={close} disabled={busy}>
          {tCommon.cancel}
        </Button>
        <Button type="submit" disabled={busy}>{busy ? tCommon.saving : tCommon.save}</Button>
      </DialogFooter>
    </form>
  );
}

export function SupplierForm({
  t, tCommon, tErrors, open, onOpenChange, editId = null,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editId ? t.editSupplier : t.newSupplier}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {open && (
          <InnerForm
            key={editId ?? "new"}
            t={t} tCommon={tCommon} tErrors={tErrors} editId={editId}
            close={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
