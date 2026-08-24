import { getT } from "@/shared/i18n";
import { getSystemSettings } from "@/features/settings/service";
import { InventorySettingsForm } from "@/features/settings/ui/settings-forms";

export default async function InventorySettingsPage() {
  const { t } = await getT();
  const data = await getSystemSettings();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.settingsPage.title}</h1>
      <InventorySettingsForm
        t={t}
        data={{
          lowStockThresholdDays: data.lowStockThresholdDays,
          expirationWarningDays: data.expirationWarningDays,
          batchTrackingEnabled: data.batchTrackingEnabled,
        }}
      />
    </div>
  );
}
