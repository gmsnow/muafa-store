"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudUpload, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import { countOutbox, flushOutbox, subscribeOutbox } from "@/shared/offline/outbox";

/**
 * Shows connection state + pending offline mutations. Clicking forces a sync;
 * sync also runs automatically on reconnect, window focus and every 30s.
 */
export function OfflineIndicator({ t }: { t: Dictionary }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    const r = await flushOutbox();
    setBusy(false);
    if (r.synced > 0) toast.success(t.common.syncDone.replace("{count}", String(r.synced)));
    else if (r.failed > 0) toast.error(t.common.syncFailed);
  }, [t]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void countOutbox().then(setPending);

    const goOnline = () => { setOnline(true); void sync(); };
    const goOffline = () => setOnline(false);
    const onFocus = () => void sync();
    const unsub = subscribeOutbox(setPending);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", onFocus);
    const iv = setInterval(() => void sync(), 30_000);
    return () => {
      unsub();
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("focus", onFocus);
      clearInterval(iv);
    };
  }, [sync]);

  if (online && pending === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-9 gap-1.5 px-2"
      onClick={() => !busy && void sync()}
      title={t.common.syncNow}
      disabled={busy}
    >
      {!online ? (
        <>
          <WifiOff className="size-4 text-destructive" />
          <span className="text-xs text-destructive">{t.common.offline}</span>
        </>
      ) : busy ? (
        <Loader2 className="size-4 animate-spin text-amber-500" />
      ) : (
        <>
          <CloudUpload className="size-4 text-amber-500" />
          <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold text-amber-600 tabular-nums dark:text-amber-400" dir="ltr">
            {pending}
          </span>
        </>
      )}
    </Button>
  );
}
