import { Suspense } from "react";
import { Snowflake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstParam, clampPage } from "@/components/pagination";
import { LiveQueryInput } from "@/components/live-query-input";
import { getT } from "@/shared/i18n";
import { StatsSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";
import { CustomerLauncher } from "../list/customer-launcher";
import { FrozenListStats } from "./stats-cards";
import { FrozenTable } from "./customers-table";

export default async function FrozenCustomersPage({
  searchParams,
}: PageProps<"/customers/frozen">) {
  const { t } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q) ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="animate-enter flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Snowflake className="size-5 text-destructive" />
          {t.customers.frozenAccountsTitle}
        </h1>
        <CustomerLauncher
          mode="form" tCommon={t.common} tErrors={t.errors} tCustomers={t.customers} tProcurement={t.procurement}
          label={t.common.create} editId={null}
        />
      </div>

      <Suspense fallback={<StatsSkeleton count={3} />}>
        <FrozenListStats />
      </Suspense>

      <form className="flex flex-wrap gap-2">
        <LiveQueryInput placeholder="…" className="w-full sm:w-64" />
        <Button type="submit" variant="outline" size="sm">{t.common.filter}</Button>
      </form>

      <Suspense fallback={<TableSkeleton rows={6} cols={7} />}>
        <FrozenTable q={q || undefined} page={page} />
      </Suspense>
    </div>
  );
}