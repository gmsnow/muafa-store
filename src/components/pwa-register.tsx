"use client";

import { useEffect } from "react";

/** Registers the service worker that backs PWA install + offline support. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app works normally without the SW.
      });
    }
  }, []);
  return null;
}
