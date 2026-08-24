import { Suspense } from "react";
import { getT } from "@/shared/i18n";
import { LoginForm } from "@/features/auth/ui/login-form";

export default async function LoginPage() {
  const { t } = await getT();
  return (
    <Suspense>
      <LoginForm t={t.auth} tErrors={t.errors} />
    </Suspense>
  );
}
