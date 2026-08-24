"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import { SupplierForm } from "./supplier-form";

export function SupplierLauncher({
  t, tCommon, tErrors, editId, label,
}: {
  t: Dictionary["procurement"];
  tCommon: Dictionary["common"];
  tErrors: Dictionary["errors"];
  editId: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={editId ? "ghost" : "default"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <SupplierForm
        t={t} tCommon={tCommon} tErrors={tErrors}
        open={open} onOpenChange={setOpen} editId={editId}
      />
    </>
  );
}
