"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import type { Dictionary } from "@/shared/i18n";

interface Results {
  products: { id: string; name: string; nameAr: string | null; sku: string; stock: number }[];
  customers: { id: string; code: string; name: string; balance: number }[];
  suppliers: { id: string; code: string; name: string }[];
  invoices: { id: string; invoiceNumber: string; total: number; customerName: string | null }[];
  purchases: { id: string; purchaseNumber: string; total: number; supplierName: string }[];
  purchaseOrders: { id: string; poNumber: string; supplierName: string }[];
  expenses: { id: string; expenseNumber: string; amount: number; description: string | null }[];
  users: { id: string; username: string; fullName: string }[];
}

const EMPTY: Results = {
  products: [], customers: [], suppliers: [], invoices: [],
  purchases: [], purchaseOrders: [], expenses: [], users: [],
};

export function GlobalSearch({ t }: { t: Dictionary }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Results>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  async function run(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      const { globalSearchAction } = await import("@/features/search/actions");
      const res = await globalSearchAction(q);
      setBusy(false);
      if (res.ok) setResults(res.data as Results);
    }, 250);
  }

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const hasAny =
    results.products.length > 0 || results.customers.length > 0 ||
    results.suppliers.length > 0 || results.invoices.length > 0 ||
    results.purchases.length > 0 || results.purchaseOrders.length > 0 ||
    results.expenses.length > 0 || results.users.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-start">{t.common.searchPlaceholder}</span>
        <kbd className="hidden rounded border px-1.5 font-mono text-[10px] sm:inline" dir="ltr">Ctrl K</kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-xl">
        <div className="relative">
          <CommandInput
            placeholder={t.common.searchPlaceholder}
            onValueChange={run}
            className={busy ? "opacity-50" : ""}
          />
          {busy && (
            <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <CommandList>
          {!hasAny && <CommandEmpty>{t.common.noData}</CommandEmpty>}
          {results.products.length > 0 && (
            <CommandGroup heading={t.nav.inventory}>
              {results.products.map((p) => (
                <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/inventory/products?q=${encodeURIComponent(p.sku)}`)}>
                  <span className="flex-1 truncate">{p.nameAr ?? p.name}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{p.sku}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.customers.length > 0 && (
            <CommandGroup heading={t.nav.customers}>
              {results.customers.map((c) => (
                <CommandItem key={c.id} value={`c-${c.id}`} onSelect={() => go(`/customers/list?edit=${c.id}`)}>
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{c.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.suppliers.length > 0 && (
            <CommandGroup heading={t.nav.procurement}>
              {results.suppliers.map((s) => (
                <CommandItem key={s.id} value={`s-${s.id}`} onSelect={() => go("/procurement/suppliers")}>
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{s.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.invoices.length > 0 && (
            <CommandGroup heading={t.sales.ordersTitle}>
              {results.invoices.map((i) => (
                <CommandItem key={i.id} value={`i-${i.id}`} onSelect={() => go(`/sales/receipt/${i.id}`)}>
                  <span className="flex-1 truncate">{i.customerName ?? t.sales.walkInCustomer}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{i.invoiceNumber}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.purchases.length > 0 && (
            <CommandGroup heading={t.procurement.purchasesTitle}>
              {results.purchases.map((p) => (
                <CommandItem key={p.id} value={`pu-${p.id}`} onSelect={() => go("/procurement/purchases")}>
                  <span className="flex-1 truncate">{p.supplierName}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{p.purchaseNumber}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.purchaseOrders.length > 0 && (
            <CommandGroup heading={t.nav.purchaseOrders}>
              {results.purchaseOrders.map((p) => (
                <CommandItem key={p.id} value={`po-${p.id}`} onSelect={() => go("/procurement/purchase-orders")}>
                  <span className="flex-1 truncate">{p.supplierName}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{p.poNumber}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.expenses.length > 0 && (
            <CommandGroup heading={t.expensesPage.title}>
              {results.expenses.map((e) => (
                <CommandItem key={e.id} value={`e-${e.id}`} onSelect={() => go("/expenses")}>
                  <span className="flex-1 truncate">{e.description ?? e.expenseNumber}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{e.expenseNumber}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {results.users.length > 0 && (
            <CommandGroup heading={t.usersPage.title}>
              {results.users.map((u) => (
                <CommandItem key={u.id} value={`u-${u.id}`} onSelect={() => go("/users")}>
                  <span className="flex-1 truncate">{u.fullName}</span>
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{u.username}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
