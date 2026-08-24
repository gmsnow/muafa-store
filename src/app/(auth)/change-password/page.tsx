import { redirect } from "next/navigation";
import { getT } from "@/shared/i18n";
import { getCurrentUser } from "@/features/auth/session";
import { ChangePasswordForm } from "@/features/auth/ui/change-password-form";

export default async function ChangePasswordPage() {
  const { t } = await getT();
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Fchange-password");
  return <ChangePasswordForm t={t.auth} tErrors={t.errors} />;
}
