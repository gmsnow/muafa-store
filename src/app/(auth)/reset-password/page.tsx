import { getT } from "@/shared/i18n";
import { ResetForm } from "@/features/auth/ui/reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const { t } = await getT();
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <ResetForm t={t.auth} token={token} />;
}
