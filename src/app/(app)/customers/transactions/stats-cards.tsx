import { Receipt, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { getCustomerTxnStats, getCustomerById } from "@/features/customers/service";
import { StatCard } from "@/features/customers/ui/stat-card";
import { cn } from "@/lib/utils";

export async function TransactionsStats({
  customerId, month,
}: { customerId?: string; month?: string }) {
  const { t, locale } = await getT();
  const [txnStats, customer] = await Promise.all([
    getCustomerTxnStats({ customerId: customerId ?? undefined, month }),
    customerId ? getCustomerById(customerId) : Promise.resolve(null),
  ]);
  const periodHint = month ?? t.customers.stats.allTime;
  const balance = customer ? D(customer.balance) : D(0);
  const creditLimit = customer ? D(customer.creditLimit) : D(0);

  return (
    <>
      {customer && (
        <div className="animate-enter flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2">
          <span className={cn("size-2 rounded-full", balance.gt(0) ? "bg-destructive" : "bg-emerald-500")} />
          <span className="font-medium">{customer.nameAr || customer.name}</span>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{customer.code}</span>
          <Badge variant={balance.gt(0) ? "destructive" : "outline"}>
            {t.customers.balance}: {formatMoney(balance.toNumber(), locale)}
          </Badge>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {customer && (
          <StatCard
            title={t.customers.stats.currentBalance}
            value={formatMoney(balance.toNumber(), locale)}
            hint={creditLimit.gt(0) ? `${t.customers.stats.creditLimitHint}: ${formatMoney(creditLimit.toNumber(), locale)}` : undefined}
            icon={Wallet}
            tone={balance.gt(0) ? "danger" : "success"}
            delay={0}
          />
        )}
        <StatCard
          title={t.customers.stats.totalDebt}
          value={formatMoney(D(txnStats.debt).toNumber(), locale)}
          hint={periodHint}
          icon={TrendingUp}
          tone="danger"
          delay={customer ? 70 : 0}
        />
        <StatCard
          title={t.customers.stats.totalPayments}
          value={formatMoney(D(txnStats.payment).toNumber(), locale)}
          hint={periodHint}
          icon={TrendingDown}
          tone="success"
          delay={customer ? 140 : 70}
        />
        {!customer && (
          <StatCard
            title={t.customers.stats.net}
            value={formatMoney(D(txnStats.net).toNumber(), locale)}
            hint={periodHint}
            icon={Wallet}
            tone="warning"
            delay={140}
          />
        )}
        <StatCard
          title={t.customers.stats.txns}
          value={formatNumber(txnStats.count, locale)}
          hint={periodHint}
          icon={Receipt}
          tone="info"
          delay={customer ? 210 : 210}
        />
      </div>
    </>
  );
}