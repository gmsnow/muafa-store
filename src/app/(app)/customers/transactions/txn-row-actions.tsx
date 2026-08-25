"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VoiceInput } from "@/components/voice-input";
import { updateCustomerTxnAction, deleteCustomerTxnAction } from "@/features/customers/actions";

type ActionError = { ok: false; error: { code: string; message?: string } };

export interface TxnRowActionsProps {
  txn: { id: string; type: string; amount: string; note: string | null };
  tCommon: Record<string, string>;
  tCustomers: Record<string, string>;
  tErrors: Record<string, string>;
}

function err(tErrors: Record<string, string>, code: string, message?: string) {
  return tErrors[code] ?? message ?? code;
}

/** Per-row edit/delete for customer transactions. Balance is recomputed server-side. */
export function TxnRowActions({ txn, tCommon, tCustomers, tErrors }: TxnRowActionsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submitEdit(formData: FormData) {
    setBusy(true);
    const res = await updateCustomerTxnAction({
      id: txn.id,
      amount: Number(formData.get("amount")),
      note: String(formData.get("note") ?? ""),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(tCustomers.txnUpdated);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(err(tErrors, (res as ActionError).error.code, (res as ActionError).error.message));
    }
  }

  async function onDelete() {
    setBusy(true);
    const res = await deleteCustomerTxnAction(txn.id);
    setBusy(false);
    if (res.ok) {
      toast.success(tCustomers.txnDeleted);
      router.refresh();
    } else {
      toast.error(err(tErrors, (res as ActionError).error.code, (res as ActionError).error.message));
    }
  }

  return (
    <div className="relative z-20 flex items-center justify-end gap-0.5">
      <Button
        variant="ghost" size="icon" className="size-7" disabled={busy}
        aria-label={tCommon.edit} title={tCommon.edit}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" disabled={busy}
            aria-label={tCommon.delete} title={tCommon.delete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCustomers.deleteTxnTitle}</AlertDialogTitle>
            <AlertDialogDescription>{tCustomers.deleteTxnConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tCommon.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void onDelete(); }}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {tCommon.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tCommon.edit}</DialogTitle>
          </DialogHeader>
          <form action={submitEdit} className="space-y-3">
            <div className="space-y-1">
              <Label>{tCustomers.paymentAmount}</Label>
              <Input
                name="amount" type="number" min="0.01" step="0.01" dir="ltr" required autoFocus
                defaultValue={Math.abs(Number(txn.amount)).toString()}
              />
            </div>
            <div className="space-y-1">
              <Label>{tCommon.notes}</Label>
              <VoiceInput name="note" maxLength={300} defaultValue={txn.note ?? ""} />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                {tCommon.cancel}
              </Button>
              <Button type="submit" disabled={busy}>{busy ? tCommon.saving : tCommon.save}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
