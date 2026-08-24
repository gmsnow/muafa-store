import { getT } from "@/shared/i18n";
import { firstParam } from "@/components/pagination";
import { getPoDetail, listSuppliers } from "@/features/procurement/service";
import { ReceivingBuilder } from "@/features/procurement/ui/receiving-builder";

export default async function ReceivingPage({
  searchParams,
}: PageProps<"/procurement/receiving">) {
  const { t } = await getT();
  const sp = await searchParams;
  const poId = firstParam(sp.po);

  const [{ rows: suppliers }, po] = await Promise.all([
    listSuppliers({ pageSize: 500 }),
    poId ? getPoDetail(poId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">
        {t.procurement.receivingTitle}{po ? ` — ${po.poNumber}` : ""}
      </h1>
      <ReceivingBuilder
        t={t.procurement} tCommon={t.common} tErrors={t.errors} tProducts={t.products} tStock={t.stock}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, nameAr: s.nameAr }))}
        lockedSupplierId={po?.supplier.id}
        poId={po?.id}
      />
    </div>
  );
}
