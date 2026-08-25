"use client";

import { useEffect } from "react";

/**
 * Registers the service worker that backs PWA install + offline support.
 * When a waiting service worker takes control after an update, reload once
 * so the tab runs the new build instead of a mix of old/new chunks.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);
  return null;
}
