"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker that backs PWA install + offline support.
 * When a waiting service worker takes control after an update, reload once
 * so the tab runs the new build instead of a mix of old/new chunks.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Friendly message for any write operation attempted offline that is not
    // covered by the outbox (sales / customer txns queue themselves).
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      if (!navigator.onLine) {
        e.preventDefault();
        toast.error("لا يوجد اتصال — هذه العملية تحتاج إنترنت وستتاح عند عودته");
      }
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;

    const onControllerChange = () => {
      if (hadController && !reloaded) {
        reloaded = true;
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: app works normally without the SW.
    });

    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
