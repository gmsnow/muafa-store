"use client";
import { VoiceInput } from "@/components/voice-input";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";

export interface EditableRole {
  id: string; name: string; nameAr: string | null; description: string | null;
  isSystem: boolean; permissions: string[]; userCount: number;
}

export interface PermissionDefUi { key: string; description: string }
export type PermissionGroup = [string, PermissionDefUi[]];

export function RoleDialog({
  t, permissionGroups, label, editRole = null,
}: {
  t: Dictionary;
  permissionGroups: PermissionGroup[];
  label: string;
  editRole?: EditableRole | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perms, setPerms] = useState<Set<string>>(new Set(editRole?.permissions ?? []));

  function toggle(key: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const { saveRoleAction } = await import("../actions");
    const res = await saveRoleAction({
      ...raw,
      id: editRole?.id ?? null,
      name: editRole?.isSystem ? editRole.name
        : (String(raw.nameAr ?? "").trim() || editRole?.name || ""),
      permissions: [...perms],
    });
    setBusy(false);
    if (res.ok) {
      toast.success(t.common.save + " ✓");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error?.message ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setPerms(new Set(editRole?.permissions ?? [])); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={editRole ? "ghost" : "default"}>{label}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editRole ? t.common.edit : t.rolesPage.newRole}</DialogTitle>
            <DialogDescription className="sr-only">{t.rolesPage.title}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>{t.rolesPage.name}</Label>
              <VoiceInput name="nameAr" dir="rtl" defaultValue={editRole?.nameAr ?? editRole?.name ?? ""} required maxLength={50} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t.common.notes}</Label>
              <VoiceInput name="description" defaultValue={editRole?.description ?? ""} maxLength={200} />
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">{t.rolesPage.permissions}</span>
              <span className="text-xs text-muted-foreground">{perms.size}/{permissionGroups.length}</span>
            </div>
            <div className="grid max-h-72 gap-x-6 gap-y-1 overflow-y-auto sm:grid-cols-2">
              {permissionGroups.map(([group, defs]) => (
                <fieldset key={group} className="mb-2">
                  <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group}</legend>
                  {defs.map((d) => (
                    <label key={d.key} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm">
                      <input
                        type="checkbox"
                        checked={perms.has(d.key)}
                        onChange={() => toggle(d.key)}
                        className="mt-1 size-3.5"
                      />
                      <span>
                        <code className="text-[11px]" dir="ltr">{d.key}</code>
                        <span className="block text-xs text-muted-foreground">{d.description}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRoleButton({ t, roleId }: { t: Dictionary; roleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(t.common.confirm)) return;
    setBusy(true);
    const { deleteRoleAction } = await import("../actions");
    const res = await deleteRoleAction(roleId);
    setBusy(false);
    if (res.ok) router.refresh();
    else toast.error(res.error?.message ?? "Error");
  }

  return (
    <Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={busy} onClick={remove}>
      {t.common.delete}
    </Button>
  );
}
