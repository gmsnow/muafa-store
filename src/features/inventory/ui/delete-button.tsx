"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { ApiResult } from "@/shared/core/api-response";

interface Props {
  action: (id: string) => Promise<ApiResult<unknown>>;
  id: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  errorLabel?: string;
  trigger: React.ReactNode;
}

/** Generic confirm-then-delete button wired to any guarded server action. */
export function DeleteButton({ action, id, title, description, confirmLabel, cancelLabel, errorLabel, trigger }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setPending(true);
    const res = await action(id);
    setPending(false);
    if (res.ok) {
      toast.success(title);
      router.refresh();
    } else {
      toast.error(res.error.message ?? errorLabel ?? "Failed");
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void onConfirm(); }}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
