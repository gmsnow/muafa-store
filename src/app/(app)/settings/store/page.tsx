import { getT } from "@/shared/i18n";
import { getStoreSettings } from "@/features/settings/service";
import { StoreSettingsForm } from "@/features/settings/ui/settings-forms";

export default async function StoreSettingsPage() {
  const { t } = await getT();
  const data = await getStoreSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.settingsPage.title}</h1>
      <StoreSettingsForm
        t={t}
        data={{
          name: data.name, nameAr: data.nameAr, logoUrl: data.logoUrl,
          address: data.address, addressAr: data.addressAr, phone: data.phone,
          currencyCode: data.currencyCode, currencySymbol: data.currencySymbol,
          receiptFooter: data.receiptFooter,
        }}
      />
    </div>
  );
}
