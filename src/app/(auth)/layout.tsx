import { Store } from "lucide-react";
import { db } from "@/shared/db";
import { getT } from "@/shared/i18n";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getT();
  const store = await db.storeSettings.findUnique({ where: { id: "store" } });
  // DB store name is the primary brand everywhere; dict only as fallback.
  const storeName = (store?.nameAr ?? store?.name) ?? t.auth.storeName;
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow">
            <Store className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{storeName}</h1>
          <p className="text-sm text-muted-foreground">{t.common.appName}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

