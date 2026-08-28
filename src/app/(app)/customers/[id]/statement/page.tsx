import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Fragment, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { getT } from "@/shared/i18n";
import { formatDateTime, formatMoney } from "@/shared/core/format";
import { D } from "@/shared/core/money";
import { getStatement } from "@/features/customers/service";
import { getStoreSettings } from "@/features/settings/service";
import { firstParam } from "@/components/pagination";
import type { CustomerTransactionType } from "@/generated/prisma/client";
import { PdfActions } from "@/components/pdf-actions";

export default async function CustomerStatementPage({
  params,
  searchParams,
}: PageProps<"/customers/[id]/statement">) {
  const { t, locale } = await getT();
  const { id } = await params;
  const sp = await searchParams;
  const parseDate = (v?: string) => {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  };
  const from = parseDate(firstParam(sp.from));
  const to = parseDate(firstParam(sp.to));
  const [{ customer, txns }, store] = await Promise.all([
    getStatement(id, { from, to }),
    getStoreSettings(),
  ]);

  const typeLabel: Record<CustomerTransactionType, string> = {
    DEBT: t.customers.debt,
    PAYMENT: t.customers.payment,
    REFUND: t.customers.refund,
    ADJUSTMENT: t.customers.adjustment,
  };

  const rows = txns.map((x) => {
    const amount = D(x.amount);
    if (x.type === "DEBT") return { x, debit: amount, credit: D(0), signed: amount };
    if (x.type === "PAYMENT" || x.type === "REFUND")
      return { x, debit: D(0), credit: amount, signed: amount.neg() };
    if (amount.gte(0)) return { x, debit: amount, credit: D(0), signed: amount };
    return { x, debit: D(0), credit: amount.abs(), signed: amount };
  });
  const signedTotal = rows.reduce((acc, r) => acc.plus(r.signed), D(0));
  const totalDebit = rows.reduce((acc, r) => acc.plus(r.debit), D(0));
  const totalCredit = rows.reduce((acc, r) => acc.plus(r.credit), D(0));
  const opening = D(customer.balance).minus(signedTotal);

  const storeName = store.nameAr || store.name;

  return (
    <div className="space-y-4">
      <style>{`
        #stmt-paper {
          max-width: 820px;
          margin: 0 auto;
          background: #ffffff;
          color: #1a1a1a;
          padding: 36px;
          border-radius: 8px;
          border: 1px solid #e5e5e5;
          font-family: inherit;
        }
        .stmt-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
          border-bottom: 2px solid #1a1a1a;
          padding-bottom: 14px;
        }
        .stmt-store { font-size: 24px; font-weight: 700; }
        .stmt-title { font-size: 20px; font-weight: 700; }
        .stmt-meta { font-size: 12px; color: #555555; }
        .stmt-info { width: 100%; margin-top: 16px; font-size: 13px; }
        .stmt-ledger { width: 100%; margin-top: 18px; border-collapse: collapse; font-size: 12.5px; }
        .stmt-total-box {
          font-size: 14px;
          font-weight: 700;
          background: #f3f3f3;
          padding: 10px 16px;
          border-radius: 6px;
        }
        @media (max-width: 640px) {
          #stmt-paper { padding: 16px 10px; border-radius: 6px; }
          .stmt-head { padding-bottom: 10px; }
          .stmt-store { font-size: 15px; }
          .stmt-title { font-size: 13px; }
          .stmt-meta { font-size: 9.5px; }
          .stmt-info { font-size: 11px; margin-top: 10px; }
          .stmt-ledger { font-size: 10.5px; margin-top: 12px; }
          .stmt-total-box { font-size: 12px; padding: 7px 10px; }
        }
        @media print {
          body * { visibility: hidden !important; }
          #stmt-paper, #stmt-paper * { visibility: visible !important; }
          #stmt-paper { position: absolute; inset: 0; width: 100%; margin: 0; box-shadow: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/customers/list">
              <ArrowRight className="size-4" /> {t.customers.backToCustomers}
            </Link>
          </Button>
          <h1 className="text-xl font-bold tracking-tight">
            {t.customers.statementTitle} — {customer.nameAr || customer.name}
          </h1>
        </div>
          {(from || to) && (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/customers/${id}/statement`}>{t.customers.fullStatement}</Link>
            </Button>
          )}
          <PdfActions
          fileName={`statement-${customer.code}`}
          targetId="stmt-paper"
          captureWidth={880}
          labels={{
            sharePdf: t.common.sharePdf,
            generatingPdf: t.common.generatingPdf,
            shareFailed: t.common.shareFailed,
          }}
        />
      </div>

      <div id="stmt-paper" dir="rtl">
        <div className="stmt-head">
          <div>
            <div className="stmt-store">{storeName}</div>
            {(store.addressAr || store.address) && (
              <div className="stmt-meta" style={{ marginTop: 4 }}>{store.addressAr || store.address}</div>
            )}
            {store.phone && (
              <div className="stmt-meta" style={{ marginTop: 2 }} dir="ltr">{store.phone}</div>
            )}
          </div>
          <div style={{ textAlign: "left" }}>
            <div className="stmt-title">{t.customers.statementTitle}</div>
            <div className="stmt-meta" style={{ marginTop: 6 }}>
              {t.customers.printedAt}: {formatDateTime(new Date(), locale)}
            </div>
            {(from || to) && (
              <div className="stmt-meta" style={{ marginTop: 2 }}>
                {t.customers.period}: {from ? formatDateTime(from, locale) : "…"} {t.customers.asOf}{" "}
                {to ? formatDateTime(to, locale) : "…"}
              </div>
            )}
          </div>
        </div>

        <table className="stmt-info">
          <tbody>
            <tr>
              <td style={infoCell}>{t.products.name}: <b>{customer.nameAr || customer.name}</b></td>
              <td style={infoCell}>{t.customers.code}: <b dir="ltr">{customer.code}</b></td>
            </tr>
            <tr>
              <td style={infoCell}>{t.customers.phone}: <b dir="ltr">{customer.phone ?? "—"}</b></td>
              <td style={infoCell}>
                {t.customers.creditLimit}:{" "}
                <b dir="ltr">{formatMoney(D(customer.creditLimit).toNumber(), locale)}</b>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="stmt-ledger">
          <thead>
            <tr style={{ background: "#f3f3f3" }}>
              <th style={headCell}>{t.common.date}</th>
              <th style={headCell}>{t.customers.details}</th>
              <th style={{ ...headCell, textAlign: "left" }}>{t.customers.debit}</th>
              <th style={{ ...headCell, textAlign: "left" }}>{t.customers.credit}</th>
              <th style={{ ...headCell, textAlign: "left" }}>{t.customers.balanceAfter}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={bodyCell} colSpan={2}>{t.customers.openingBalance}</td>
              <td style={{ ...bodyCell, textAlign: "left" }}>—</td>
              <td style={{ ...bodyCell, textAlign: "left" }}>—</td>
              <td style={{ ...bodyCell, textAlign: "left", fontWeight: 600 }} dir="ltr">
                {formatMoney(opening.toNumber(), locale)}
              </td>
            </tr>
            {rows.map(({ x, debit, credit }) => (
              <Fragment key={x.id}>
                <tr>
                  <td style={bodyCell}>{formatDateTime(x.createdAt, locale)}</td>
                  <td style={bodyCell}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0 }}>
                      <span style={{ minWidth: 0, wordBreak: "break-word" }}>
                        {typeLabel[x.type]}
                        {x.note ? ` — ${x.note}` : ""}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...bodyCell, textAlign: "left" }} dir="ltr">
                    {debit.gt(0) ? formatMoney(debit.toNumber(), locale) : "—"}
                  </td>
                  <td style={{ ...bodyCell, textAlign: "left" }} dir="ltr">
                    {credit.gt(0) ? formatMoney(credit.toNumber(), locale) : "—"}
                  </td>
                  <td style={{ ...bodyCell, textAlign: "left", fontWeight: 500 }} dir="ltr">
                    {formatMoney(D(x.balanceAfter).toNumber(), locale)}
                  </td>
                </tr>
                {x.imagePath && (
                  <tr>
                    <td colSpan={5} style={{ ...bodyCell, background: "#fafafa" }}>
                      <div style={{ display: "flex", justifyContent: "center", padding: "6px 0" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/customers/transactions/${x.id}/image`}
                          alt=""
                          loading="eager"
                          style={{ maxWidth: "100%", maxHeight: 520, borderRadius: 4 }}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length > 0 && (
              <tr style={{ background: "#fafafa", borderTop: "1px solid #999999" }}>
                <td style={{ ...bodyCell, fontWeight: 700 }} colSpan={2}>{t.common.total}</td>
                <td style={{ ...bodyCell, textAlign: "left", fontWeight: 700 }} dir="ltr">
                  {formatMoney(totalDebit.toNumber(), locale)}
                </td>
                <td style={{ ...bodyCell, textAlign: "left", fontWeight: 700 }} dir="ltr">
                  {formatMoney(totalCredit.toNumber(), locale)}
                </td>
                <td style={bodyCell} />
              </tr>
            )}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p style={{ textAlign: "center", color: "#777777", marginTop: 28, fontSize: 14 }}>
            {t.customers.noTxns}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 22, alignItems: "center", gap: 8 }}>
          <div className="stmt-total-box">
            {t.customers.closingBalance}: <span dir="ltr">{formatMoney(D(customer.balance).toNumber(), locale)}</span>
          </div>
          <div style={{ fontSize: 12, color: "#555555" }}>
            <div style={{ borderTop: "1px solid #999999", paddingTop: 6, minWidth: 160, textAlign: "center" }}>
              {t.customers.signatureLine}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const headCell: CSSProperties = {
  border: "1px solid #dddddd",
  padding: "7px 8px",
  fontSize: 12,
  textAlign: "right",
};

const bodyCell: CSSProperties = {
  border: "1px solid #e2e2e2",
  padding: "6px 8px",
};

const infoCell: CSSProperties = {
  padding: "3px 0",
  color: "#555555",
};
