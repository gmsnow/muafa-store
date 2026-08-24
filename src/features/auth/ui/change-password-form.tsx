"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";

export function ChangePasswordForm({
  t, tErrors,
}: {
  t: Dictionary["auth"];
  tErrors: Dictionary["errors"];
}) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(tErrors.VALIDATION_ERROR);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    const { changeOwnPasswordAction } = await import("../actions");
    const res = await changeOwnPasswordAction({ password, confirmPassword });
    setBusy(false);
    if (res.ok) {
      toast.success("Password updated");
      router.replace("/dashboard");
      router.refresh();
    } else {
      setError(res.error.message);
    }
  }

  async function logout() {
    const { logoutAction } = await import("../actions");
    await logoutAction();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t.changePasswordTitle}</CardTitle>
        <CardDescription>{t.changePasswordSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="new-password">{t.password}</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                aria-label={showPassword ? "hide" : "show"}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t.password}</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              dir="ltr"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t.signingIn}
              </>
            ) : (
              t.signIn
            )}
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={logout}>
            <LogOut className="size-4" /> {t.logout}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
