"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Snowflake } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/shared/core/api-response";

interface Props {
  action: (id: string, frozen: boolean) => Promise<ApiResult<unknown>>;
  id: string;
  frozen: boolean;
  labels: {
    freeze: string;
    unfreeze: string;
    freezeConfirm: string;
    unfreezeConfirm: string;
    freezeOk: string;
    unfreezeOk: string;
    cancel: string;
    confirm: string;
  };
}

/** Toggle a customer's frozen balance with confirmation. */
export function FreezeButton({ action, id, frozen, labels }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const next = !frozen;

  async function onConfirm() {
    setPending(true);
    const res = await action(id, next);
    setPending(false);
    if (res.ok) {
      toast.success(next ? labels.freezeOk : labels.unfreezeOk);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error.message ?? "Failed");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className={frozen ? "text-destructive hover:text-destructive" : undefined}>
          <Snowflake className={frozen ? "size-3.5 text-destructive" : "size-3.5"} />
          <span className="ms-1">{frozen ? labels.unfreeze : labels.freeze}</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{next ? labels.freeze : labels.unfreeze}</AlertDialogTitle>
          <AlertDialogDescription>{next ? labels.freezeConfirm : labels.unfreezeConfirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{labels.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void onConfirm(); }}
            disabled={pending}
            className={next ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          >
            {labels.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}