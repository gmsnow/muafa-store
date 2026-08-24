"use client";

import { useEffect } from "react";

/** Fires the browser print dialog once after the receipt mounts. */
export function PrintTrigger() {
  useEffect(() => {
    const handle = setTimeout(() => window.print(), 300);
    return () => clearTimeout(handle);
  }, []);
  return null;
}
