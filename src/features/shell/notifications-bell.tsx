"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { Dictionary } from "@/shared/i18n";

export interface NotificationItem {
  id: string;
  type: string;
  body: string;
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
};

export function NotificationsBell({
  t,
  items,
}: {
  t: Dictionary;
  items: NotificationItem[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const unread = items.filter((i) => i.isRead && !readIds.has(i.id)).length;

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
              <li key={n.id} className={`border-b last:border-b-0 ${n.isRead ? "" : "bg-primary/5"}`}>
                <Link
                  href={HREF_BY_TYPE[n.type] ?? "/dashboard"}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={n.isRead ? "outline" : "secondary"} className="text-[10px]">{label}</Badge>
                    <span className="text-[10px] text-muted-foreground" dir="ltr">
                      {new Date(n.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs" dir="auto">{n.body}</p>
                </Link>
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
