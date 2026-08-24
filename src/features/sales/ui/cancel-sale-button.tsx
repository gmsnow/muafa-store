"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import { cancelSaleAction } from "../actions";

export function CancelSaleButton({
  t, tErrors, saleId,
}: {
  t: Dictionary["sales"];
  tErrors: Dictionary["errors"];
  saleId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const res = await cancelSaleAction(saleId);
    setBusy(false);
    if (res.ok) {
      toast.success(t.cancelledOk);
      router.refresh();
    } else {
      toast.error(res.error.code in tErrors ? tErrors[res.error.code as keyof typeof tErrors] : res.error.message);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy}>
          {t.cancelSale}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.cancelSale}</AlertDialogTitle>
          <AlertDialogDescription>{t.cancelWarning}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>✕</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void confirm(); }}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {t.cancelSale}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
