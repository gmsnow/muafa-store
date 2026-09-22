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

export function ClearAccountButton({
  customerId, labels,
}: {
  customerId: string;
  labels: { title: string; confirm: string; success: string; cancel: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onConfirm() {
    setPending(true);
    const res = await import("@/features/customers/actions").then((m) =>
      m.clearCustomerAccountAction(customerId),
    );
    setPending(false);
    if (res.ok) {
      toast.success(labels.success);
      router.refresh();
    } else {
      toast.error(res.error.message ?? res.error.code);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" size="sm" disabled={pending}>
          {labels.title}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.title}</AlertDialogTitle>
          <AlertDialogDescription>{labels.confirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{labels.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void onConfirm(); }}
            disabled={pending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {labels.title}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}