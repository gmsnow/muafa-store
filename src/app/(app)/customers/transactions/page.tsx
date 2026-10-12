import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { firstParam, clampPage } from "@/components/pagination";
import { getT } from "@/shared/i18n";
import { StatsSkeleton, TableSkeleton } from "@/components/ui/page-skeletons";
import { TransactionsStats } from "./stats-cards";
import { TransactionsTable } from "./transactions-table";
import { PaymentLauncher } from "./payment-launcher";

export default async function CustomerTransactionsPage({
  searchParams,
}: PageProps<"/customers/transactions">) {
  const { t } = await getT();
  const sp = await searchParams;
  const page = clampPage(firstParam(sp.page));
  const q = firstParam(sp.q)?.trim() || undefined;
  const customerId = firstParam(sp.customerId);
  const monthParam = firstParam(sp.month)?.trim() || "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : undefined;

  const backHref = `/customers/transactions?1=1${q ? `&q=${encodeURIComponent(q)}` : ""}${month ? `&month=${month}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {customerId && (
            <Link
              href={backHref}
              aria-label={t.common.back}
              className="inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent"
            >
              <ArrowRight className="size-4" />
            </Link>
          )}
          <h1 className="animate-enter text-2xl font-bold tracking-tight">{t.customers.transactionsTitle}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!customerId && (
            <Suspense fallback={<Button variant="default" size="sm" disabled>…</Button>}>
              <PaymentLauncher />
            </Suspense>
          )}
        </div>
      </div>

      <Suspense fallback={<StatsSkeleton count={4} />}>
        <TransactionsStats customerId={customerId} month={month} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
        <TransactionsTable customerId={customerId} q={q} month={month} monthParam={monthParam} page={page} />
      </Suspense>
    </div>
  );
}