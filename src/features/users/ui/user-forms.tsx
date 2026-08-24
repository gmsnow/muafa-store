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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";

export interface RoleOpt { id: string; name: string; nameAr: string | null }

export interface EditableUser {
  id: string; username: string; fullName: string; fullNameAr: string | null;
  email: string | null; phone: string | null; roleId: string; status: string;
}

export function UserDialog({
  t, roles, label, editUser = null,
}: {
  t: Dictionary;
  roles: RoleOpt[];
  label: string;
  editUser?: EditableUser | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [roleId, setRoleId] = useState(editUser?.roleId ?? "");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (!String(raw.fullNameAr ?? "").trim() && editUser?.fullName) raw.fullName = editUser.fullName;
    else raw.fullName = raw.fullNameAr;
    const { saveUserAction } = await import("../actions");
    const res = await saveUserAction(raw, editUser?.id ?? null);
    setBusy(false);
    if (res.ok) {
      toast.success(t.usersPage.userSaved);
      setOpen(false);
      router.refresh();
    } else {
      toast.error(res.error?.message ?? "Error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={editUser ? "ghost" : "default"}>{label}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-3">
          <DialogHeader>
            <DialogTitle>{editUser ? t.common.edit : t.usersPage.newUser}</DialogTitle>
            <DialogDescription className="sr-only">{t.usersPage.title}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t.usersPage.username}</Label>
              <Input name="username" defaultValue={editUser?.username ?? ""} required maxLength={50} dir="ltr"
                pattern="[a-zA-Z0-9._-]+" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.usersPage.role}</Label>
              <select name="roleId" value={roleId} onChange={(e) => setRoleId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm" required>
                <option value="" disabled>—</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nameAr ? `${r.name} — ${r.nameAr}` : r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t.usersPage.fullName}</Label>
              <VoiceInput name="fullNameAr" dir="rtl" defaultValue={editUser?.fullNameAr ?? editUser?.fullName ?? ""} required maxLength={150} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={editUser?.email ?? ""} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>{t.common.phone}</Label>
              <VoiceInput name="phone" defaultValue={editUser?.phone ?? ""} dir="ltr" maxLength={30} />
            </div>
            <div className="space-y-1.5">
              <Label>{t.usersPage.password}</Label>
              <Input name="password" type="password" minLength={6} maxLength={100} dir="ltr"
                autoComplete="new-password" required={!editUser} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button type="submit" size="sm" disabled={busy || !roleId}>
              {busy ? t.common.saving : t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UserRowActions({
  t, roles, user,
}: {
  t: Dictionary;
  roles: RoleOpt[];
  user: EditableUser & { roleName: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggleStatus() {
    if (!window.confirm(t.common.confirm)) return;
    setBusy(true);
    const { setUserStatusAction } = await import("../actions");
    const res = await setUserStatusAction(user.id, user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE");
    setBusy(false);
    if (res.ok) {
      toast.success(t.usersPage.userSaved);
      router.refresh();
    } else {
      toast.error(res.error?.message ?? "Error");
    }
  }

  async function remove() {
    if (!window.confirm(t.common.delete + " — " + t.common.confirm)) return;
    setBusy(true);
    const { deleteUserAction } = await import("../actions");
    const res = await deleteUserAction(user.id);
    setBusy(false);
    if (res.ok) {
      toast.success(t.usersPage.userSaved);
      router.refresh();
    } else {
      toast.error(res.error?.message ?? "Error");
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <UserDialog
        t={t} roles={roles} label={t.common.edit} editUser={user}
      />
      <Button variant="ghost" size="sm" className="h-7" disabled={busy} onClick={toggleStatus}>
        {user.status === "ACTIVE" ? t.usersPage.suspend : t.usersPage.activate}
      </Button>
      <Button variant="ghost" size="sm" className="h-7 text-destructive" disabled={busy} onClick={remove}>
        {t.common.delete}
      </Button>
    </div>
  );
}
