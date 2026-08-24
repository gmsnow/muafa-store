"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "@/shared/i18n";
import { CustomerForm } from "@/features/customers/ui/customer-form";
import { CustomerTxnDialog, LoyaltyAdjustDialog } from "@/features/customers/ui/credit-forms";
type Common = Dictionary["common"];
type Errors = Dictionary["errors"];
type CustomersDict = Dictionary["customers"];
type ProcurementDict = Dictionary["procurement"];

export function CustomerLauncher({
  mode,
  tCommon, tErrors, tCustomers, tProcurement,
  label, editId, customers, defaultCustomerId,
}: {
  mode: "form" | "payment" | "loyalty";
  tCommon: Common;
  tErrors: Errors;
  tCustomers: CustomersDict;
  tProcurement?: ProcurementDict;
  customers?: { id: string; name: string; nameAr: string | null; balance?: string; loyaltyPoints?: string }[];
  label: string;
  editId: string | null;
  defaultCustomerId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant={editId ? "ghost" : "default"} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {mode === "form" && (
        <CustomerForm
          t={tProcurement!} tCommon={tCommon} tErrors={tErrors} tCustomers={tCustomers}
          open={open} onOpenChange={setOpen} editId={editId}
        />
      )}
      {mode === "payment" && (
        <CustomerTxnDialog
          tCommon={tCommon} tErrors={tErrors} tCustomers={tCustomers}
          open={open} onOpenChange={setOpen}
          customers={customers ?? []} defaultCustomerId={defaultCustomerId}
        />
      )}
      {mode === "loyalty" && (
        <LoyaltyAdjustDialog
          tCommon={tCommon} tErrors={tErrors} tCustomers={tCustomers}
          open={open} onOpenChange={setOpen}
          customers={customers ?? []} defaultCustomerId={defaultCustomerId}
        />
      )}
    </>
  );
}
