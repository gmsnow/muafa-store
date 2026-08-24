"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Delete allowed only within 24h of creation (enforced again server-side). */
export function DeleteRecentExpenseButton({
  id, deletable, label, confirmText,
}: {
  id: string;
  deletable: boolean;
  label: string;
  confirmText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!deletable) return null;

  async function remove() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    const { deleteExpenseAction } = await import("@/features/expenses/actions");
    const res = await deleteExpenseAction(id);
    setBusy(false);
    if (res.ok) router.refresh();
    else toast.error(res.error.message);
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={remove} disabled={busy}>
      {label}
    </Button>
  );
}
