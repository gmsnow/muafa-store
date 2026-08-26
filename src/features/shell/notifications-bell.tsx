"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/shared/i18n";

export interface NotificationItem {
  id: string;
  type: string;
  body: string;
  href?: string | null;
  isRead: boolean;
  createdAt: string;
}

const HREF_BY_TYPE: Record<string, string> = {
  LOW_STOCK: "/inventory/stock",
  OUT_OF_STOCK: "/inventory/stock",
  EXPIRING: "/inventory/expiring",
  EXPIRED: "/inventory/expiring",
  PENDING_PO: "/procurement/purchase-orders",
  CREDIT_LIMIT: "/customers/list",
};

const LABEL_KEY_BY_TYPE: Record<string, keyof Dictionary["notif"]> = {
  LOW_STOCK: "lowStock",
  OUT_OF_STOCK: "outOfStock",
  EXPIRING: "expiring",
  EXPIRED: "expired",
  PENDING_PO: "pendingPo",
  CREDIT_LIMIT: "creditLimit",
  SALE: "sale",
  SALE_CANCELLED: "saleCancelled",
  SALE_RETURN: "saleReturn",
  PURCHASE_ORDER: "purchaseOrder",
  GOODS_RECEIVED: "goodsReceived",
  PURCHASE_RETURN: "purchaseReturn",
  SUPPLIER_PAYMENT: "supplierPayment",
  STOCK_ADJUSTMENT: "stockAdjustment",
  EXPENSE: "expense",
  CUSTOMER_PAYMENT: "customerPayment",
};

const POLL_MS = 30_000;

export function NotificationsBell({
  t,
  items: initialItems,
}: {
  t: Dictionary;
  items: NotificationItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Server renders re-seed the list (navigation, markAllRead refresh) —
  // adjusted during render per react.dev guidance instead of in an effect.
  const [seededFrom, setSeededFrom] = useState(initialItems);
  if (seededFrom !== initialItems) {
    setSeededFrom(initialItems);
    setItems(initialItems);
  }

  async function fetchLatest() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setItems(json.data.items);
    } catch {
      // transient network error — keep showing the current list
    }
  }

  // Live updates while the dashboard stays open.
  useEffect(() => {
    const id = setInterval(fetchLatest, POLL_MS);
    return () => clearInterval(id);
  }, []);

  // Fresh data every time the popover opens.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void fetchLatest();
  }

  const unread = items.filter((i) => !i.isRead && !readIds.has(i.id)).length;

  async function markAll() {
    setBusy(true);
    const { markAllReadAction } = await import("@/features/notifications/actions");
    const res = await markAllReadAction();
    setBusy(false);
    if (res.ok) {
      setReadIds(new Set(items.map((i) => i.id)));
      router.refresh();
    } else {
      toast.error(res.error.message);
    }
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { deleteNotificationAction } = await import("@/features/notifications/actions");
    const res = await deleteNotificationAction(id);
    if (!res.ok) {
      toast.error(res.error.message);
      router.refresh();
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-9" aria-label={t.nav.notifications}>
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">{t.nav.notifications}</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={markAll} disabled={busy}>
              <CheckCheck className="size-3.5" />
              {t.nav.markAllRead}
            </Button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.map((n) => {
            const labelKey = LABEL_KEY_BY_TYPE[n.type];
            const label = labelKey ? t.notif[labelKey] : n.type;
            return (
              <li key={n.id} className={`group relative border-b last:border-b-0 ${!n.isRead && !readIds.has(n.id) ? "bg-primary/5" : ""}`}>
                <Link
                  href={n.href ?? HREF_BY_TYPE[n.type] ?? "/dashboard"}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 pe-8 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={!n.isRead ? "secondary" : "outline"} className="text-[10px]">{label}</Badge>
                    <span className="text-[10px] text-muted-foreground" dir="ltr">
                      {new Date(n.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs" dir="auto">{n.body}</p>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t.common.delete}
                  className="absolute end-1 top-1.5 size-6 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(n.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t.nav.noNotifications}</li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
