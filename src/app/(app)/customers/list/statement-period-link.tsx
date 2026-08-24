"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Period = "day" | "week" | "month";

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Builds UTC instants for a local day / Sat–Fri week / calendar month. */
function rangeFor(period: Period, value: string): { from: string; to: string } | null {
  if (!value) return null;
  if (period === "month") {
    const [y, m] = value.split("-").map(Number);
    if (!y || !m) return null;
    return {
      from: new Date(y, m - 1, 1).toISOString(),
      to: new Date(y, m, 0, 23, 59, 59, 999).toISOString(),
    };
  }
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  if (period === "day") {
    return {
      from: new Date(y, m - 1, d).toISOString(),
      to: new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(),
    };
  }
  // week containing the picked date (Saturday → Friday)
  const daysSinceSat = (new Date(y, m - 1, d).getDay() + 1) % 7;
  const start = new Date(y, m - 1, d - daysSinceSat);
  return {
    from: start.toISOString(),
    to: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999).toISOString(),
  };
}

export function StatementPeriodLink({
  customerId,
  labels,
}: {
  customerId: string;
  labels: { trigger: string; title: string; day: string; week: string; month: string; view: string };
}) {
  const router = useRouter();
  const today = new Date();
  const [period, setPeriod] = useState<Period>("day");
  const [dateValue, setDateValue] = useState(isoDay(today));
  const [monthValue, setMonthValue] = useState(isoDay(today).slice(0, 7));

  function open() {
    const range = rangeFor(period, period === "month" ? monthValue : dateValue);
    if (!range) return;
    router.push(
      `/customers/${customerId}/statement?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {labels.trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {(["day", "week", "month"] as Period[]).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {labels[p]}
            </Button>
          ))}
        </div>
        {period === "month" ? (
          <input
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        ) : (
          <input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        )}
        {period === "week" && dateValue && (
          <p className="text-xs text-muted-foreground">
            {labels.week}: {rangeFor("week", dateValue)
              ? `${new Date(rangeFor("week", dateValue)!.from).toLocaleDateString("ar")} — ${new Date(rangeFor("week", dateValue)!.to).toLocaleDateString("ar")}`
              : ""}
          </p>
        )}
        <Button type="button" onClick={open} disabled={!(period === "month" ? monthValue : dateValue)}>
          {labels.view}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
