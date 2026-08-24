"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schema";
import { forgotPasswordAction } from "../actions";

export function ForgotForm({ t }: { t: Dictionary["auth"] }) {
  const [devToken, setDevToken] = useState<string | null>(null);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = async (values: ForgotPasswordInput) => {
    const res = await forgotPasswordAction(values);
    if (res.ok) {
      setDevToken(res.data.devToken ?? null);
      toast.success(t.resetSent);
    } else {
      toast.error(res.error.message);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t.forgotTitle}</CardTitle>
        <CardDescription>{t.forgotSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t.identity}</Label>
            <Input id="email" type="email" dir="ltr" {...form.register("email")} />
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : t.sendResetLink}
          </Button>
        </form>
        {devToken && (
          <div className="rounded-md border bg-muted p-3 text-xs break-all" dir="ltr">
            <span className="font-semibold">{t.devTokenHint}</span> /reset-password?token={devToken}
          </div>
        )}
        <div className="text-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            ← {t.loginTitle}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
