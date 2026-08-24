import { getT } from "@/shared/i18n";
import { listSuppliers } from "@/features/procurement/service";
import { PoBuilder } from "@/features/procurement/ui/po-builder";

export default async function NewPurchaseOrderPage() {
  const { t } = await getT();
  const { rows: suppliers } = await listSuppliers({ pageSize: 500 });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{t.procurement.newPo}</h1>
      <PoBuilder
        t={t.procurement} tCommon={t.common} tErrors={t.errors} tProducts={t.products}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr }))}
      />
    </div>
  );
}
