import { Snowflake, UserCheck, Wallet } from "lucide-react";
import { getT } from "@/shared/i18n";
import { formatMoney, formatNumber } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { getCustomerStats } from "@/features/customers/service";
import { StatCard } from "@/features/customers/ui/stat-card";

export async function FrozenListStats() {
  const { t, locale } = await getT();
  const stats = await getCustomerStats();

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <StatCard
        title={t.customers.stats.frozen}
        value={formatNumber(stats.frozen, locale)}
        icon={Snowflake}
        tone="danger"
        delay={0}
      />
      <StatCard
        title={t.customers.stats.frozenReceivable}
        value={formatMoney(D(stats.frozenReceivable).toNumber(), locale)}
        icon={Wallet}
        tone="warning"
        delay={70}
      />
      <StatCard
        title={t.customers.stats.withDebt}
        value={formatNumber(stats.withDebt, locale)}
        hint={`${t.customers.stats.receivable}: ${formatMoney(D(stats.receivable).toNumber(), locale)}`}
        icon={UserCheck}
        tone="info"
        delay={140}
      />
    </div>
  );
}