"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Minus, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Dictionary } from "@/shared/i18n";
import { formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { checkoutAction } from "../actions";

interface PosProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  nameAr: string | null;
  sellingPrice: string;
  unitSymbol: string | null;
  quantity: string | null;
}

interface CartLine extends PosProduct {
  qty: number;
  discount: number;
}

interface CustomerOpt {
  id: string;
  code: string;
  name: string;
  nameAr?: string | null;
  balance: string;
  creditLimit: string;
}

interface CheckoutResult {
  saleId: string;
  invoiceNumber: string;
  total: number;
  paid: number;
  changeDue: number;
  credit: number;
  pointsEarned: number;
}

type PayMethod = "CASH" | "CARD" | "BANK_TRANSFER" | "WALLET" | "CREDIT";

interface Props {
  t: Dictionary;
  locale: string;
  products: PosProduct[];
  customers: CustomerOpt[];
  canDiscount: boolean;
}

export function PosTerminal({ t, locale, products, customers, canDiscount }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PosProduct[]>(products.slice(0, 12));
  const [customerId, setCustomerId] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("CASH");
  const [paidAmount, setPaidAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const s = t.sales;

  // Debounced product search (server action).
  useEffect(() => {
    const handle = setTimeout(async () => {
      const { posSearchAction } = await import("../actions");
      const res = await posSearchAction(query);
      if (res.ok) setResults(res.data as PosProduct[]);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((a, l) => a + D(l.qty).mul(D(l.sellingPrice)).minus(D(l.discount)).toNumber(), 0);
    const discount = Number(invoiceDiscount) || 0;
    const total = Math.max(0, subtotal - discount);
    const paid = payMethod === "CREDIT" ? 0 : Number(paidAmount) || 0;
    const creditTotal = Math.max(0, total - paid);
    return { subtotal, total, creditTotal };
  }, [cart, invoiceDiscount, paidAmount, payMethod]);

  const addToCart = useCallback((p: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.id === p.id);
      if (existing) {
        return prev.map((l) => (l.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...prev, { ...p, qty: 1, discount: 0 }];
    });
  }, []);

  // Barcode scanner support: exact-match on Enter.
  async function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = query.trim();
    if (!code) return;
    const { barcodeLookupAction, posSearchAction } = await import("../actions");
    const res = await barcodeLookupAction(code);
    if (res.ok && res.data.productId) {
      const found = results.find((p) => p.id === res.data.productId);
      if (found) addToCart(found);
      setQuery("");
      searchRef.current?.focus();
      return;
    }
    // fall through to search results refresh
    const sr = await posSearchAction(code);
    if (sr.ok) {
      setResults(sr.data as PosProduct[]);
      if ((sr.data as PosProduct[]).length === 1) {
        addToCart((sr.data as PosProduct[])[0]);
        setQuery("");
        searchRef.current?.focus();
      }
    }
  }

  function bumpQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => (l.id === id ? { ...l, qty: Math.max(0.001, Number((l.qty + delta).toFixed(3))) } : l)),
    );
  }

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const overLimit =
    selectedCustomer &&
    D(selectedCustomer.creditLimit).gt(0) &&
    D(selectedCustomer.balance).plus(totals.creditTotal).gt(D(selectedCustomer.creditLimit));

  async function checkout() {
    if (cart.length === 0 || busy || overLimit) return;
    setBusy(true);
    const payments: { method: PayMethod; amount: number }[] = [];
    const paid = Number(paidAmount) || 0;
    if (payMethod !== "CREDIT") {
      payments.push({ method: payMethod, amount: Math.min(paid, totals.total) });
    }
    const res = await checkoutAction({
      items: cart.map((l) => ({ productId: l.id, quantity: l.qty, discount: l.discount || undefined })),
      customerId,
      invoiceDiscount: Number(invoiceDiscount) || 0,
      payments: totals.creditTotal > 0
        ? [...payments, { method: "CREDIT" as const, amount: totals.creditTotal }]
        : payments,
    });
    setBusy(false);
    if (res.ok) {
      setReceipt(res.data as CheckoutResult);
      setCart([]);
      setPaidAmount("");
      setInvoiceDiscount("");
      router.refresh();
    } else {
      const msg = res.error.code in t.errors ? t.errors[res.error.code as keyof typeof t.errors] : res.error.message;
      toast.error(msg);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Product search + results */}
      <div className="space-y-3 lg:col-span-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={t.products.scanBarcode}
            className="ps-9"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
          {results.map((p) => {
            const stock = p.quantity ? D(p.quantity).toNumber() : 0;
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={stock <= 0}
                className="rounded-lg border bg-card p-3 text-start transition hover:border-primary hover:bg-accent disabled:opacity-40"
              >
                <p className="truncate text-sm font-medium">
                  {p.nameAr ?? p.name}
                </p>
                <p className="font-mono text-[11px] text-muted-foreground" dir="ltr">{p.sku}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-sm font-semibold">{formatMoney(D(p.sellingPrice).toNumber(), locale)}</span>
                  <span className={`text-[11px] ${stock <= 0 ? "text-destructive" : "text-muted-foreground"}`} dir="ltr">
                    ×{stock}
                  </span>
                </div>
              </button>
            );
          })}
          {results.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">{t.common.noData}</p>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="lg:col-span-2">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{s.cart}</h2>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>{s.clearCart}</Button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.dashboard.productCol}</TableHead>
                  <TableHead className="w-24 text-center">{t.common.quantity}</TableHead>
                  <TableHead className="text-end">{t.common.subtotal}</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <p className="max-w-32 truncate text-sm font-medium">
                        {l.nameAr ?? l.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatMoney(D(l.sellingPrice).toNumber(), locale)}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="outline" size="icon" className="size-6" onClick={() => bumpQty(l.id, -1)}>
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-10 text-center font-mono text-xs tabular-nums" dir="ltr">{l.qty}</span>
                        <Button variant="outline" size="icon" className="size-6" onClick={() => bumpQty(l.id, 1)}>
                          <Plus className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-end text-sm tabular-nums">
                      {formatMoney(D(l.qty).mul(D(l.sellingPrice)).minus(D(l.discount)).toNumber(), locale)}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setCart((prev) => prev.filter((x) => x.id !== l.id))}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="remove"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {cart.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="h-20 text-center text-xs text-muted-foreground">{s.emptyCart}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <Row label={t.common.subtotal} value={formatMoney(totals.subtotal, locale)} />
            <Row label={`${s.invoiceDiscount}`} value={
              <Input
                type="number" min="0" step="0.01" dir="ltr"
                value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(e.target.value)}
                className="h-7 w-24 text-end"
                disabled={!canDiscount}
              />
            } />
            <div className="flex items-center justify-between border-t pt-1 text-base font-bold">
              <span>{s.grandTotal}</span>
              <span>{formatMoney(totals.total, locale)}</span>
            </div>
          </div>

          {/* Customer */}
          <div className="space-y-1">
            <Label className="text-xs">{s.selectCustomer}</Label>
            <Select value={customerId || "__walkin"} onValueChange={(v) => setCustomerId(v === "__walkin" ? "" : v)}>
              <SelectTrigger size="sm"><SelectValue placeholder={s.walkInCustomer} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__walkin">{s.walkInCustomer}</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {`${c.nameAr ?? c.name} (${c.code})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{t.dashboard.paymentMethod}</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PayMethod)}>
                <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">{s.payCash}</SelectItem>
                  <SelectItem value="CARD">{s.payCard}</SelectItem>
                  <SelectItem value="BANK_TRANSFER">{s.payTransfer}</SelectItem>
                  <SelectItem value="WALLET">{s.payWallet}</SelectItem>
                  <SelectItem value="CREDIT">{s.payCredit}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {payMethod !== "CREDIT" && (
              <div className="space-y-1">
                <Label className="text-xs">{s.amountPaid}</Label>
                <Input
                  type="number" min="0" step="0.01" dir="ltr"
                  value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)}
                  className="h-8 text-end"
                />
              </div>
            )}
          </div>
          {payMethod !== "CREDIT" && Number(paidAmount) > 0 && (
            <p className="text-end text-sm text-muted-foreground">
              {s.changeDue}:{" "}
              <span className="font-semibold text-foreground">
                {formatMoney(Math.max(0, (Number(paidAmount) || 0) - totals.total), locale)}
              </span>
            </p>
          )}
          {totals.creditTotal > 0 && !selectedCustomer && (
            <p className="text-xs text-destructive">{s.creditRequiresCustomer}</p>
          )}
          {overLimit && <p className="text-xs text-destructive">{s.creditLimitExceeded}</p>}

          <Button
            className="w-full"
            size="lg"
            onClick={checkout}
            disabled={cart.length === 0 || busy || !!overLimit || (totals.creditTotal > 0 && !selectedCustomer)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {s.checkout} · {formatMoney(totals.total, locale)}
          </Button>
        </CardContent>
      </Card>

      {/* Mobile sticky checkout bar — the phone workflow: search → tap → checkout */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">
              {s.cart}: {cart.length}
            </p>
            <p className="text-base font-bold tabular-nums">{formatMoney(totals.total, locale)}</p>
          </div>
          <Button size="lg" onClick={checkout} disabled={cart.length === 0 || busy || !!overLimit || (totals.creditTotal > 0 && !selectedCustomer)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {s.checkout}
          </Button>
        </div>
      </div>

      {/* Success receipt dialog */}
      <Dialog open={!!receipt} onOpenChange={(v) => !v && setReceipt(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{s.saleCompleted.replace("{invoice}", receipt?.invoiceNumber ?? "")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 pt-2 text-sm">
                <Row label={s.grandTotal} value={formatMoney(receipt?.total ?? 0, locale)} />
                {(receipt?.changeDue ?? 0) > 0 && <Row label={s.changeDue} value={formatMoney(receipt!.changeDue, locale)} />}
                {(receipt?.credit ?? 0) > 0 && <Row label={s.payCredit} value={formatMoney(receipt!.credit, locale)} />}
                {(receipt?.pointsEarned ?? 0) > 0 && <Row label={t.customers.loyaltyPoints} value={String(receipt!.pointsEarned)} />}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <a href={`/sales/receipt/${receipt?.saleId ?? ""}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm"><Printer className="size-4" /> {s.printInvoice}</Button>
            </a>
            <Button size="sm" onClick={() => { setReceipt(null); searchRef.current?.focus(); }}>
              {s.newSale}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}


