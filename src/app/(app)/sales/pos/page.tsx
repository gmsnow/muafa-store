import { db } from "@/shared/db";
import { hasPermission } from "@/shared/auth/rbac";
import { getCurrentUser } from "@/features/auth/session";
import { getT } from "@/shared/i18n";
import { searchProductsForPos } from "@/features/sales/service";
import { PosTerminal } from "@/features/sales/ui/pos-terminal";
import { D } from "@/shared/core/money";

export default async function PosPage() {
  const { t, locale } = await getT();
  const user = await getCurrentUser();

  const [products, customers] = await Promise.all([
    searchProductsForPos("", 12),
    db.customer.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true, nameAr: true, balance: true, creditLimit: true },
      orderBy: { code: "asc" },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-4 pb-20 lg:pb-0">
      <h1 className="text-2xl font-bold tracking-tight">{t.sales.posTitle}</h1>
      <PosTerminal
        t={t}
        locale={locale}
        canDiscount={hasPermission(user?.permissions ?? [], "sales.discount")}
        products={products.map((p) => ({
          id: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          nameAr: p.nameAr,
          sellingPrice: D(p.sellingPrice).toString(),
          unitSymbol: p.unit.symbol,
          quantity: p.inventory?.quantity ? D(p.inventory.quantity).toString() : "0",
        }))}
        customers={customers.map((c) => ({
          id: c.id, code: c.code, name: c.name, nameAr: c.nameAr,
          balance: D(c.balance).toString(), creditLimit: D(c.creditLimit).toString(),
        }))}
      />
    </div>
  );
}
