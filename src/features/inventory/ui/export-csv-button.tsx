"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportCsvButton({
  action,
  filename,
  label,
}: {
  action: () => Promise<{ ok: true; data: { csv: string } } | { ok: false; error: { code: string; message: string } }>;
  filename: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error.message);
      return;
    }
    const blob = new Blob(["\uFEFF" + res.data.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}
