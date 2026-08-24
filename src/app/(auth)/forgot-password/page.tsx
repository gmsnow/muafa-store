import { getT } from "@/shared/i18n";
import { ForgotForm } from "@/features/auth/ui/forgot-form";

export default async function ForgotPasswordPage() {
  const { t } = await getT();
  return <ForgotForm t={t.auth} />;
}
