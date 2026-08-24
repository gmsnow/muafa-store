"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import type { PurchaseOrderStatus } from "@/generated/prisma/client";
import { transitionPoAction } from "@/features/procurement/actions";

export function PoActions({
  tProcurement, tErrors, poId, status, canReceive,
}: {
  tProcurement: Dictionary["procurement"];
  tErrors: Dictionary["errors"];
  poId: string;
  status: PurchaseOrderStatus;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "submit" | "approve" | "order" | "cancel") {
    setBusy(true);
    const res = await transitionPoAction(poId, action);
    setBusy(false);
    if (res.ok) {
      toast.success(tProcurement.poUpdated);
      router.refresh();
    } else {
      toast.error(tErrors[res.error.code as keyof typeof tErrors] ?? res.error.message);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {status === "DRAFT" && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("submit")}>
          {tProcurement.submitPo}
        </Button>
      )}
      {status === "PENDING" && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("approve")}>
          {tProcurement.approvePo}
        </Button>
      )}
      {status === "APPROVED" && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("order")}>
          {tProcurement.orderPo}
        </Button>
      )}
      {["DRAFT", "PENDING", "APPROVED", "ORDERED"].includes(status) && (
        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void act("cancel")}>
          ✕
        </Button>
      )}
      {canReceive && (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/procurement/receiving?po=${poId}`}>{tProcurement.receive}</Link>
        </Button>
      )}
    </div>
  );
}
