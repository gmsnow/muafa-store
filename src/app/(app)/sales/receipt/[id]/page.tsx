import { notFound } from "next/navigation";
import { db } from "@/shared/db";
import { getT } from "@/shared/i18n";
import { getStoreSettings } from "@/features/settings/service";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { PrintTrigger } from "./print-trigger";
import { PdfActions } from "@/components/pdf-actions";

/** Thermal-friendly printable receipt — minimal chrome, auto-prints. */
export default async function ReceiptPage({ params }: PageProps<"/sales/receipt/[id]">) {
  const { t, locale } = await getT();
  const { id } = await params;

  const [sale, store] = await Promise.all([
    db.sale.findUnique({
      where: { id },
      include: {
        customer: { select: { code: true, name: true, nameAr: true } },
        cashier: { select: { fullName: true, username: true } },
        items: { orderBy: { id: "asc" } },
        payments: true,
      },
    }),
    // Cached getter shared with the (app) layout — one read per request.
    getStoreSettings(),
  ]);
  if (!sale) notFound();

  const storeName = store.nameAr ?? store.name ?? t.auth.storeName;

  return (
    <div className="min-h-screen space-y-3 bg-background py-4 print:min-h-0 print:bg-transparent print:py-0">
      <div className="mx-auto flex max-w-[420px] justify-center px-2">
        <PdfActions fileName={`invoice-${sale.invoiceNumber}`} labels={{
          sharePdf: t.common.sharePdf,
          generatingPdf: t.common.generatingPdf,
          shareFailed: t.common.shareFailed,
        }} />
      </div>

      <div id="pdf-paper" className="relative mx-auto max-w-[420px] bg-white p-6 text-black print:p-0" dir="rtl">
      <PrintTrigger />

      <div className="text-center">
        <h1 className="text-lg font-bold">{storeName}</h1>
        {store?.receiptFooter && <p className="mt-1 text-[10px]">{store.receiptFooter}</p>}
        <p className="mt-2 font-mono text-sm font-bold" dir="ltr">{sale.invoiceNumber}</p>
        <p className="text-xs">{formatDateTime(sale.saleDate, locale)}</p>
        <p className="text-xs">
          {t.dashboard.cashier}: {sale.cashier.fullName || sale.cashier.username}
          {sale.customer && ` · ${sale.customer.nameAr ?? sale.customer.name}`}
        </p>
      </div>

      <table className="mt-4 w-full text-xs">
        <thead>
          <tr className="border-b border-black/40 text-start">
            <th className="py-1 text-start font-medium">{t.dashboard.productCol}</th>
            <th className="py-1 text-center font-medium">Q</th>
            <th className="py-1 text-end font-medium">P</th>
            <th className="py-1 text-end font-medium">T</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id} className="border-b border-dashed border-black/20">
              <td className="py-1 pe-1">
                {item.productNameAr ?? item.productName}
                {D(item.discount).gt(0) && (
                  <span className="block text-[9px] text-black/60">−{D(item.discount).toNumber()}</span>
                )}
              </td>
              <td className="py-1 text-center tabular-nums" dir="ltr">{D(item.quantity).toNumber()}</td>
              <td className="py-1 text-end tabular-nums" dir="ltr">{D(item.unitPrice).toNumber()}</td>
              <td className="py-1 text-end tabular-nums" dir="ltr">{D(item.lineTotal).toNumber()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-0.5 text-xs">
        <Line label={t.common.subtotal} value={D(sale.subtotal).toNumber()} />
        {D(sale.itemDiscountTotal).gt(0) && <Line label={t.common.discount} value={D(sale.itemDiscountTotal).negated().toNumber()} />}
        {D(sale.invoiceDiscount).gt(0) && <Line label={s_invoiceDiscount(t)} value={D(sale.invoiceDiscount).negated().toNumber()} />}
        <div className="flex justify-between border-t border-black pt-1 text-sm font-bold">
          <span>{t.sales.grandTotal}</span>
          <span dir="ltr">{formatMoney(D(sale.total).toNumber(), "ar")}</span>
        </div>
        {sale.payments.map((pm) => (
          <Line key={pm.id} label={payment_label(pm.method, t)} value={D(pm.amount).toNumber()} />
        ))}
        {D(sale.changeDue).gt(0) && <Line label={t.sales.changeDue} value={D(sale.changeDue).negated().toNumber()} />}
        {D(sale.creditAmount).gt(0) && <Line label={t.sales.payCredit} value={D(sale.creditAmount).toNumber()} />}
        {D(sale.refundedAmount).gt(0) && <Line label={t.reports.returns} value={D(sale.refundedAmount).negated().toNumber()} />}
      </div>

      {sale.notes && <p className="mt-3 text-center text-[10px]">{sale.notes}</p>}
      <p className="mt-4 text-center text-[10px]">{store?.receiptFooter ?? ""}</p>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span dir="ltr" className="tabular-nums">{value.toLocaleString("ar-YE-u-nu-latn")}</span>
    </div>
  );
}

function s_invoiceDiscount(t: Awaited<ReturnType<typeof getT>>["t"]): string {
  return `${t.sales.invoiceDiscount}`;
}

function payment_label(method: string, t: Awaited<ReturnType<typeof getT>>["t"]): string {
  switch (method) {
    case "CASH": return t.sales.payCash;
    case "CARD": return t.sales.payCard;
    case "BANK_TRANSFER": return t.sales.payTransfer;
    case "WALLET": return t.sales.payWallet;
    case "CREDIT": return t.sales.payCredit;
    default: return method;
  }
}
