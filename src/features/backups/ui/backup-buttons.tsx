"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";

export function CreateBackupButton({ t }: { t: Dictionary }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const { createBackupAction } = await import("@/features/backups/actions");
    const res = await createBackupAction(undefined);
    setBusy(false);
    if (res.ok) {
      toast.success(t.backupPage.backupDone);
      router.refresh();
    } else {
      toast.error(res.error?.message ?? "Error");
    }
  }

  return (
    <Button size="sm" onClick={run} disabled={busy}>
      {busy ? t.common.loading : t.backupPage.createBackup}
    </Button>
  );
}

export function DeleteBackupButton({ t, id }: { t: Dictionary; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(t.common.confirm)) return;
    setBusy(true);
    const { deleteBackupAction } = await import("@/features/backups/actions");
    const res = await deleteBackupAction(id);
    setBusy(false);
    if (res.ok) router.refresh();
    else toast.error(res.error?.message ?? "Error");
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={busy} onClick={remove}>
      {t.common.delete}
    </Button>
  );
}

export function RestoreHint({ t, dbName }: { t: Dictionary; dbName: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t.backupPage.restoreInstructions}
      </Button>
    );
  }
  return (
    <div className="w-full space-y-1 rounded-md border bg-muted/40 p-3">
      <Label className="text-xs">{t.backupPage.restoreCmd}</Label>
      <code className="block overflow-x-auto whitespace-nowrap rounded bg-muted p-2 font-mono text-xs" dir="ltr">
        psql -h &lt;host&gt; -U &lt;user&gt; -d {dbName} -f grocery-backup-&lt;timestamp&gt;.sql
      </code>
      <p className="text-xs text-muted-foreground">{t.backupPage.automatedNote}</p>
      <Button variant="ghost" size="sm" className="h-7" onClick={() => setOpen(false)}>{t.common.close}</Button>
    </div>
  );
}
