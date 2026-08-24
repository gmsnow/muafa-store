"use client";
import { VoiceInput } from "@/components/voice-input";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Dictionary } from "@/shared/i18n";
import { saveCategoryAction, saveBrandAction, saveUnitAction, addConversionAction, deleteConversionAction } from "../actions";

interface Opt { id: string; name: string; nameAr?: string | null }

function useSave<T>(saveFn: (id: string | null, values: T) => Promise<{ ok: boolean; error?: { message: string } }>, done?: () => void) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(id: string | null, values: T) {
    setBusy(true);
    const res = await saveFn(id, values);
    setBusy(false);
    if (res.ok) {
      toast.success("Saved");
      setOpen(false);
      router.refresh();
      done?.();
    } else {
      toast.error(res.error?.message ?? "Failed");
    }
  }
  return { open, setOpen, busy, submit };
}

// --- Category ---------------------------------------------------------------

export function CategoryFormDialog({
  t, tCommon, parents, category,
}: {
  t: Dictionary["catalog"]; tCommon: Dictionary["common"];
  parents: { id: string; name: string; nameAr?: string | null }[];
  category?: { id: string; name: string; nameAr?: string | null; parentId?: string | null };
}) {
  const { open, setOpen, busy, submit } = useSave(saveCategoryAction);
  const [parentId, setParentId] = useState(category?.parentId ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {category ? (
          <Button variant="ghost" size="sm">{tCommon.edit}</Button>
        ) : (
          <Button size="sm"><Plus className="size-4" /> {tCommon.create}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t.categoriesTitle}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const nameAr = String(fd.get("nameAr") ?? "").trim();
            void submit(category?.id ?? null, {
              name: nameAr || category?.name || "",
              nameAr: nameAr || null,
              description: null,
              parentId: parentId || null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="cat-namear">الاسم</Label>
            <VoiceInput id="cat-namear" name="nameAr" dir="rtl" defaultValue={category?.nameAr ?? ""} required maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label>{t.parentCategory}</Label>
            <Select value={parentId || "__root"} onValueChange={(v) => setParentId(v === "__root" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__root">{t.noneRoot}</SelectItem>
                {parents.filter((p) => p.id !== category?.id).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nameAr || p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tCommon.cancel}</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} {tCommon.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Brand ------------------------------------------------------------------

export function BrandFormDialog({
  tCommon, brand,
}: { tCommon: Dictionary["common"]; brand?: { id: string; name: string; nameAr?: string | null } }) {
  const { open, setOpen, busy, submit } = useSave(saveBrandAction);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {brand ? (
          <Button variant="ghost" size="sm">{tCommon.edit}</Button>
        ) : (
          <Button size="sm"><Plus className="size-4" /> {tCommon.create}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Brand</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const nameAr = String(fd.get("nameAr") ?? "").trim();
            void submit(brand?.id ?? null, {
              name: nameAr || brand?.name || "",
              nameAr: nameAr || null,
              description: null,
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="b-namear">الاسم</Label>
            <VoiceInput id="b-namear" name="nameAr" dir="rtl" defaultValue={brand?.nameAr ?? ""} required maxLength={120} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tCommon.cancel}</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} {tCommon.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Unit -------------------------------------------------------------------

export function UnitFormDialog({
  t, tCommon, unit,
}: { t: Dictionary["catalog"]; tCommon: Dictionary["common"]; unit?: { id: string; name: string; nameAr?: string | null; symbol?: string | null; isBase: boolean } }) {
  const { open, setOpen, busy, submit } = useSave(saveUnitAction);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {unit ? (
          <Button variant="ghost" size="sm">{tCommon.edit}</Button>
        ) : (
          <Button size="sm"><Plus className="size-4" /> {tCommon.create}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{t.unitsTitle}</DialogTitle></DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const nameAr = String(fd.get("nameAr") ?? "").trim();
            void submit(unit?.id ?? null, {
              name: nameAr || unit?.name || "",
              nameAr: nameAr || null,
              symbol: String(fd.get("symbol") ?? "").trim() || null,
              isBase: fd.get("isBase") === "on",
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="u-namear">الاسم</Label>
            <VoiceInput id="u-namear" name="nameAr" dir="rtl" defaultValue={unit?.nameAr ?? ""} required maxLength={60} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="u-symbol">{t.symbol}</Label>
            <Input id="u-symbol" name="symbol" dir="ltr" defaultValue={unit?.symbol ?? ""} maxLength={16} />
          </div>
          {!unit && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="isBase" defaultChecked={false} /> {t.baseUnit}
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tCommon.cancel}</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} {tCommon.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Conversion -------------------------------------------------------------

export function ConversionFormDialog({ t, units }: { t: Dictionary["catalog"]; units: Opt[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [factor, setFactor] = useState("");

  async function run() {
    if (!from || !to || !factor) return;
    setBusy(true);
    const res = await addConversionAction({ fromUnitId: from, toUnitId: to, factor: Number(factor) });
    setBusy(false);
    if (res.ok) {
      toast.success("Saved");
      setFactor("");
      router.refresh();
    } else {
      toast.error(res.error.message);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/30 p-3">
      <div className="min-w-36 flex-1 space-y-1">
        <Label className="text-xs">{t.conversionFrom}</Label>
        <Select value={from} onValueChange={setFrom}>
          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {units.map((u) => <SelectItem key={u.id} value={u.id}>{label_of(u)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <span className="pb-2 text-muted-foreground">×</span>
      <div className="w-24 space-y-1">
        <Label className="text-xs">{t.factor}</Label>
        <Input type="number" step="any" min="0" value={factor} onChange={(e) => setFactor(e.target.value)} dir="ltr" />
      </div>
      <span className="pb-2 text-muted-foreground">=</span>
      <div className="min-w-36 flex-1 space-y-1">
        <Label className="text-xs">{t.conversionTo}</Label>
        <Select value={to} onValueChange={setTo}>
          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {units.map((u) => <SelectItem key={u.id} value={u.id}>{label_of(u)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button size="sm" onClick={run} disabled={busy || !from || !to || !Number(factor)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
      </Button>
    </div>
  );
}

export function DeleteConversionButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost" size="sm" disabled={busy}
      onClick={async () => {
        setBusy(true);
        await deleteConversionAction(id);
        setBusy(false);
        router.refresh();
      }}
    >
      ✕
    </Button>
  );
}

function label_of(u: Opt) {
  return u.nameAr || u.name;
}

