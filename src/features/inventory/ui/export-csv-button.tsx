"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ExportResult =
  | { ok: true; data: { base64: string; mime: string; ext: string } }
  | { ok: false; error: { code: string; message: string } };

export function ExportButton({
  action,
  filename,
  label,
}: {
  action: () => Promise<ExportResult>;
  filename: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      const bytes = Uint8Array.from(atob(res.data.base64), (ch) => ch.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.data.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.${res.data.ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {label}
    </Button>
  );
}