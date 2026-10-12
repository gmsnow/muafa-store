import { getT } from "@/shared/i18n";
import { listCustomerOptions } from "@/features/customers/service";
import { CustomerLauncher } from "../list/customer-launcher";

export async function PaymentLauncher() {
  const { t } = await getT();
  const customers = await listCustomerOptions();
  return (
    <CustomerLauncher
      mode="payment"
      tCommon={t.common} tErrors={t.errors} tCustomers={t.customers}
      customers={customers.map((c) => ({
        id: c.id, name: c.name, nameAr: c.nameAr, balance: String(c.balance),
      }))}
      label={t.customers.addPayment} editId={null}
    />
  );
}