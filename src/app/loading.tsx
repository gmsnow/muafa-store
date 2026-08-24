import { Loader2 } from "lucide-react";
import { getT } from "@/shared/i18n";

export default async function Loading() {
  const { t } = await getT();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{t.common.loading}</p>
    </div>
  );
}
