"use client";
import { VoiceInput, VoiceTextarea } from "@/components/voice-input";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ImageError, prepareImage, type PreparedImage } from "@/shared/client/image";
import type { Dictionary } from "@/shared/i18n";

type ActionKey =
  | "saveStoreSettingsAction"
  | "saveSalesSettingsAction"
  | "saveInventorySettingsAction"
  | "saveLocalizationSettingsAction"
  | "saveSecuritySettingsAction";

function useSettingsForm(
  actionKey: ActionKey,
  t: Dictionary,
  transform?: (raw: Record<string, FormDataEntryValue>) => Record<string, FormDataEntryValue>,
  prepare?: (raw: Record<string, FormDataEntryValue>) => Promise<Record<string, FormDataEntryValue> | false>,
  onSaved?: () => void,
) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    let payload = transform ? transform(raw) : raw;
    if (prepare) {
      const prepared = await prepare(payload);
      if (prepared === false) {
        setBusy(false);
        return;
      }
      payload = prepared;
    }
    const mod = await import("../actions");
    const res = await (mod[actionKey] as (raw: unknown) => Promise<{ ok: boolean; error?: { message: string } }>)(
      payload,
    );
    setBusy(false);
    if (res.ok) {
      onSaved?.();
      toast.success(t.settingsPage.saved);
      router.refresh();
    } else {
      toast.error(res.error?.message ?? "Error");
    }
  }
  return { busy, submit };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function StoreSettingsForm({
  t, data,
}: {
  t: Dictionary;
  data: {
    name: string; nameAr: string | null; logoUrl: string | null; address: string | null;
    addressAr: string | null; phone: string | null;
    currencyCode: string; currencySymbol: string; receiptFooter: string | null;
  };
}) {
  const [logoPick, setLogoPick] = useState<PreparedImage | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);

  const { busy, submit } = useSettingsForm(
    "saveStoreSettingsAction",
    t,
    (raw) => {
      // Arabic-only inputs: mirror the Arabic name/address into the canonical EN columns.
      if (!String(raw.nameAr ?? "").trim() && data.name) raw.name = data.name;
      else raw.name = raw.nameAr;
      if (!String(raw.addressAr ?? "").trim() && data.address) raw.address = data.address;
      else raw.address = raw.addressAr;
      return raw;
    },
    async (raw) => {
      if (!logoPick) return raw;
      const mod = await import("../actions");
      const res = await (mod.uploadStoreLogoAction as (raw: unknown) => Promise<{
        ok: boolean; data?: { path: string }; error?: { message: string };
      }>)({ dataUrl: logoPick.dataUrl, mime: logoPick.mime });
      if (!res.ok || !res.data) {
        toast.error(res.error?.message ?? "Error");
        return false;
      }
      raw.logoUrl = res.data.path;
      return raw;
    },
    () => {
      // Drop the local pick after a successful save — the persisted raw
      // now owns the logo so a later edit of other fields won't re-upload.
      setLogoPick(null);
      setLogoRemoved(false);
    },
  );

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setLogoPick(await prepareImage(file));
      setLogoRemoved(false);
    } catch (err) {
      toast.error(err instanceof ImageError ? err.message : "Could not read image");
    }
  }

  function clearLogo() {
    setLogoPick(null);
    setLogoRemoved(true);
  }

  const s = t.settingsPage;
  const hiddenLogo = logoPick ? logoPick.dataUrl : logoRemoved ? "" : (data.logoUrl ?? "");
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{s.title} — {t.nav.store}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="logoUrl" value={hiddenLogo} />
          <Field label={s.storeNameAr}><VoiceInput name="nameAr" dir="rtl" defaultValue={data.nameAr ?? data.name ?? ""} required maxLength={150} /></Field>
          <Field label={s.logoUrl}>
            <div className="flex items-center gap-3">
              {logoPick && (
                // Local preview only — the stored object lives in a private bucket.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPick.dataUrl} alt="" className="size-14 shrink-0 rounded-md border bg-muted object-contain" />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => logoInput.current?.click()}>
                  {s.logoChoose}
                </Button>
                {(logoPick || (!logoRemoved && data.logoUrl)) && (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={clearLogo}>
                    {s.logoRemove}
                  </Button>
                )}
              </div>
              <input
                ref={logoInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onLogoFile}
              />
            </div>
            <p className="text-xs text-muted-foreground">{s.logoHint}</p>
          </Field>
          <Field label={t.common.phone}><Input name="phone" defaultValue={data.phone ?? ""} dir="ltr" maxLength={30} /></Field>
          <div className="sm:col-span-2"><Field label={t.common.address}><VoiceInput name="addressAr" dir="rtl" defaultValue={data.addressAr ?? data.address ?? ""} maxLength={300} /></Field></div>
          <Field label={s.currency}><Input name="currencyCode" defaultValue={data.currencyCode} required maxLength={8} dir="ltr" /></Field>
          <Field label={s.currencySymbol}><Input name="currencySymbol" defaultValue={data.currencySymbol} required maxLength={8} /></Field>
          <div className="sm:col-span-2"><Field label={s.receiptFooter}><VoiceTextarea name="receiptFooter" rows={2} defaultValue={data.receiptFooter ?? ""} maxLength={300} /></Field></div>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? t.common.saving : t.common.save}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SalesSettingsForm({
  t, data,
}: {
  t: Dictionary;
  data: { invoicePrefix: string };
}) {
  const { busy, submit } = useSettingsForm("saveSalesSettingsAction", t);
  const s = t.settingsPage;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{s.title} — {t.nav.sales}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={s.invoicePrefix}>
            <Input name="invoicePrefix" defaultValue={data.invoicePrefix} required maxLength={8} dir="ltr" pattern="[A-Za-z-]{1,8}" />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? t.common.saving : t.common.save}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function InventorySettingsForm({
  t, data,
}: {
  t: Dictionary;
  data: { lowStockThresholdDays: number; expirationWarningDays: number; batchTrackingEnabled: boolean };
}) {
  const { busy, submit } = useSettingsForm("saveInventorySettingsAction", t);
  const [batchTracking, setBatchTracking] = useState(data.batchTrackingEnabled);
  const s = t.settingsPage;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{s.title} — {t.nav.inventory}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="batchTrackingEnabled" value={batchTracking ? "true" : "false"} />
          <Field label={t.stock.lowStockTitle}>
            <Input name="lowStockThresholdDays" type="number" min="0" max="365" defaultValue={data.lowStockThresholdDays} required dir="ltr" />
          </Field>
          <Field label={s.expirationWarningDays}>
            <Input name="expirationWarningDays" type="number" min="1" max="365" defaultValue={data.expirationWarningDays} required dir="ltr" />
          </Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch checked={batchTracking} onCheckedChange={setBatchTracking} id="batchTracking" />
            <Label htmlFor="batchTracking">تتبع الدفعات</Label>
          </div>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? t.common.saving : t.common.save}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function LocalizationSettingsForm({
  t, data,
}: {
  t: Dictionary;
  data: { dateFormat: string; timezone: string };
}) {
  const { busy, submit } = useSettingsForm("saveLocalizationSettingsAction", t);
  const [dateFormat, setDateFormat] = useState(data.dateFormat);
  const s = t.settingsPage;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{s.title} — {t.nav.localization}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="dateFormat" value={dateFormat} />
          <Field label={s.language}>
            <Input value="العربية" readOnly dir="rtl" />
          </Field>
          <Field label={s.dateFormat}>
            <Select value={dateFormat} onValueChange={setDateFormat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent dir="ltr">
                <SelectItem value="yyyy-MM-dd">yyyy-MM-dd</SelectItem>
                <SelectItem value="dd/MM/yyyy">dd/MM/yyyy</SelectItem>
                <SelectItem value="MM/dd/yyyy">MM/dd/yyyy</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={s.timezone}>
            <Input name="timezone" defaultValue={data.timezone} required maxLength={60} dir="ltr" />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? t.common.saving : t.common.save}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

export function SecuritySettingsForm({
  t, data,
}: {
  t: Dictionary;
  data: { passwordMinLength: number; sessionTimeoutMinutes: number; maxLoginAttempts: number; lockoutMinutes: number };
}) {
  const { busy, submit } = useSettingsForm("saveSecuritySettingsAction", t);
  const s = t.settingsPage;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{s.title} — {t.nav.security}</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label={s.passwordMinLength}>
            <Input name="passwordMinLength" type="number" min="6" max="64" defaultValue={data.passwordMinLength} required dir="ltr" />
          </Field>
          <Field label={s.sessionTimeout}>
            <Input name="sessionTimeoutMinutes" type="number" min="15" max="10080" defaultValue={data.sessionTimeoutMinutes} required dir="ltr" />
          </Field>
          <Field label={s.maxLoginAttempts}>
            <Input name="maxLoginAttempts" type="number" min="3" max="20" defaultValue={data.maxLoginAttempts} required dir="ltr" />
          </Field>
          <Field label={s.lockoutMinutes}>
            <Input name="lockoutMinutes" type="number" min="1" max="1440" defaultValue={data.lockoutMinutes} required dir="ltr" />
          </Field>
          <div className="sm:col-span-2"><Button type="submit" size="sm" disabled={busy}>{busy ? t.common.saving : t.common.save}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
