import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { firstParam, clampPage } from "@/components/pagination";
import { LiveQueryInput } from "@/components/live-query-input";
import { getT } from "@/shared/i18n";
import { StatsSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";
import { SafeSection, PageSafe } from "@/components/ui/safe-section";
import { CustomerLauncher } from "./customer-launcher";
import { CustomerListStats } from "./stats-cards";
import { CustomersTable } from "./customers-table";

export default function CustomersPage(props: PageProps<"/customers/list">) {
  return <PageSafe name="customers.list.page" run={() => CustomersPageBody(props)} />;
}

async function CustomersPageBody({
  searchParams,
}: PageProps<"/customers/list">) {
  const { t } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="animate-enter text-2xl font-bold tracking-tight">{t.customers.title}</h1>
        <CustomerLauncher
          mode="form" tCommon={t.common} tErrors={t.errors} tCustomers={t.customers} tProcurement={t.procurement}
          label={t.common.create} editId={null}
        />
      </div>

      <Suspense fallback={<StatsSkeleton count={4} />}>
        <SafeSection name="customers.list.stats" run={() => CustomerListStats()} />
      </Suspense>

      <form className="flex flex-wrap gap-2">
        <LiveQueryInput placeholder="…" className="w-full sm:w-64" />
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
        <SafeSection run={() => CustomersTable({ q: q || undefined, page })} name="customers.list.table" />
      </Suspense>
    </div>
  );
}