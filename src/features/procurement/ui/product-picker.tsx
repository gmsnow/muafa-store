"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { procProductSearchAction } from "../actions";

export interface PickRow {
  id: string;
  sku: string;
  name: string;
  nameAr: string | null;
  costPrice: string;
  trackBatches: boolean;
  trackExpiry: boolean;
  unitSymbol: string;
}

export function ProductPicker({
  onPick, placeholder,
}: {
  onPick: (p: PickRow) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickRow[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || q.trim().length < 2) return;
    const handle = setTimeout(async () => {
      const res = await procProductSearchAction(q);
      if (res.ok) setRows(res.data as PickRow[]);
    }, 250);
    return () => clearTimeout(handle);
  }, [q, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "SKU / barcode / name…"}
        dir="ltr"
      />
      {open && rows.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-accent"
              onClick={() => { onPick(r); setOpen(false); setQ(""); }}
            >
              <span className="min-w-0 truncate">{r.nameAr ?? r.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground" dir="ltr">
                {r.sku} · {r.unitSymbol}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PrintButton({ label }: { label: string }) {
  return <Button variant="outline" size="sm" onClick={() => window.print()}>{label}</Button>;
}
