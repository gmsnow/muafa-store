"use client";
import { VoiceInput, VoiceTextarea } from "@/components/voice-input";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Dictionary } from "@/shared/i18n";

const METHODS = ["CASH", "CARD", "BANK_TRANSFER", "WALLET", "CREDIT"] as const;

interface CategoryOpt { id: string; name: string; nameAr: string | null }

export function NewExpenseDialog({
  t, categories, label,
}: {
  t: Dictionary;
  categories: CategoryOpt[];
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [method, setMethod] = useState<string>("CASH");

  async function submit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    const payload = { ...raw, method };
    const { saveExpenseAction } = await import("../actions");
    const res = await saveExpenseAction(payload);
    setBusy(false);
    if (res.ok) {
      toast.success(t.expensesPage.saved);
      setOpen(false);
      setCategoryId("");
      setMethod("CASH");
      router.refresh();
    } else {
      toast.error(res.error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{label}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{t.expensesPage.newExpense}</DialogTitle>
            <DialogDescription className="sr-only">{t.expensesPage.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t.expensesPage.category}</Label>
            <Select value={categoryId} onValueChange={setCategoryId} name="categoryId" required>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nameAr && c.name ? `${c.name} — ${c.nameAr}` : c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!categoryId && <input type="hidden" name="categoryId" value="" />}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t.expensesPage.amount}</Label>
              <Input name="amount" type="number" step="0.01" min="0" required dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.expensesPage.method}</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m === "CASH" ? t.sales.payCash
                      : m === "CARD" ? t.sales.payCard
                      : m === "BANK_TRANSFER" ? t.sales.payTransfer
                      : m === "WALLET" ? t.sales.payWallet
                      : t.sales.payCredit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t.expensesPage.description}</Label>
            <VoiceTextarea name="description" rows={2} maxLength={500} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.reports.dateRange}</Label>
            <Input name="expenseDate" type="date" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={busy || !categoryId}>
              {busy ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseCategoryManager({
  t, categories,
}: {
  t: Dictionary;
  categories: (CategoryOpt & { _count: { expenses: number } })[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    const raw = Object.fromEntries(formData.entries());
    raw.name = raw.nameAr;
    const { saveExpenseCategoryAction } = await import("../actions");
    const res = await saveExpenseCategoryAction(null, raw);
    setBusy(false);
    if (res.ok) {
      toast.success(t.expensesPage.saved);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error.message);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t.common.confirm)) return;
    const { deleteExpenseCategoryAction } = await import("../actions");
    const res = await deleteExpenseCategoryAction(id);
    if (res.ok) router.refresh();
    else toast.error(res.error.message);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{t.catalog.categoriesTitle}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.catalog.categoriesTitle}</DialogTitle>
          <DialogDescription className="sr-only">{t.expensesPage.title}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
              <span className="truncate">
                {c.name}
                {c.nameAr && <span className="ms-2 text-muted-foreground">{c.nameAr}</span>}
                <span className="ms-2 text-xs text-muted-foreground">({c._count.expenses})</span>
              </span>
              <Button
                variant="ghost" size="sm" className="h-7 text-destructive"
                disabled={c._count.expenses > 0}
                onClick={() => remove(c.id)}
              >
                {t.common.delete}
              </Button>
            </li>
          ))}
        </ul>
        <form action={submit} className="flex items-end gap-2 border-t pt-3">
          <div className="flex-1 space-y-1">
            <Label>{t.products.nameAr}</Label>
            <VoiceInput name="nameAr" dir="rtl" required maxLength={100} />
          </div>
          <Button type="submit" size="sm" disabled={busy}>{busy ? t.common.saving : t.common.create}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
