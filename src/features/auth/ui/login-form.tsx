"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";
import { loginSchema, type LoginInput } from "../schema";
import { loginAction } from "../actions";

interface Props {
  t: Dictionary["auth"];
  tErrors: Dictionary["errors"];
}

export function LoginForm({ t, tErrors }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identity: "", password: "", remember: false } as LoginInput,
  });

  const onSubmit = async (values: LoginInput) => {
    const res = await loginAction(values);
    if (res.ok) {
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : res.data.redirect);
      router.refresh();
    } else {
      const msg =
        res.error.code in tErrors
          ? tErrors[res.error.code as keyof typeof tErrors]
          : tErrors.INVALID_CREDENTIALS;
      toast.error(msg);
      if (res.error.fields) {
        for (const [key, messages] of Object.entries(res.error.fields)) {
          form.setError(key as keyof LoginInput, { message: messages[0] });
        }
      }
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t.loginTitle}</CardTitle>
        <CardDescription>{t.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="identity">{t.identity}</Label>
            <Input
              id="identity"
              autoComplete="username"
              dir="ltr"
              {...form.register("identity")}
            />
            {form.formState.errors.identity && (
              <p className="text-xs text-destructive">{form.formState.errors.identity.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t.password}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                dir="ltr"
                {...form.register("password")}
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

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox {...form.register("remember")} />
              {t.rememberMe}
            </label>
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
              {t.forgotPassword}
            </Link>
          </div>

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> {t.signingIn}
              </>
            ) : (
              t.signIn
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
