"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Dictionary } from "@/shared/i18n";
import { resetPasswordSchema, type ResetPasswordInput } from "../schema";
import { resetPasswordAction } from "../actions";

export function ResetForm({ t, token }: { t: Dictionary["auth"]; token: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });

  const onSubmit = async (values: ResetPasswordInput) => {
    const res = await resetPasswordAction(values);
    if (res.ok) {
      setDone(true);
      toast.success(t.resetSuccess);
      router.replace("/login");
    } else {
      toast.error(res.error.message);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t.resetTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <input type="hidden" {...form.register("token")} />
          <div className="space-y-2">
            <Label htmlFor="password">{t.newPassword}</Label>
            <Input id="password" type="password" dir="ltr" autoComplete="new-password" {...form.register("password")} />
            {form.formState.errors.password && (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t.confirmPassword}</Label>
            <Input id="confirmPassword" type="password" dir="ltr" autoComplete="new-password" {...form.register("confirmPassword")} />
            {form.formState.errors.confirmPassword && (
              <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting || done}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : t.resetButton}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
