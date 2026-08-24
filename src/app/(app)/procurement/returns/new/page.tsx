import { getT } from "@/shared/i18n";
import { PurchaseReturnWizard } from "@/features/procurement/ui/return-wizard";

export default async function NewPurchaseReturnPage() {
  const { t } = await getT();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.procurement.newPurchaseReturn}</h1>
      <PurchaseReturnWizard
        t={t.procurement} tCommon={t.common} tErrors={t.errors}
        tSales={t.sales} tProducts={t.products}
      />
    </div>
  );
}
