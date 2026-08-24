$ErrorActionPreference = "Stop"
$root = "H:\hitham\new project\grocery"
$p = "$root\src\features\reports\service.ts"
$s = [IO.File]::ReadAllText($p)
function Rep([string]$old, [string]$new) {
  if ($script:s.Contains($new)) { Write-Output "SKIP(has)"; return }
  if ($script:s.Contains($old)) { $script:s = $script:s.Replace($old, $new); Write-Output "OK" }
  else { Write-Output "MISS<<< $($old.Substring(0,[Math]::Min(60,$old.Length)) -replace "\r?\n"," | ")" }
}
$NL = "`n"
# --- SalesSummary ---
Rep "  returnsTotal: number;$NL  netSales: number;$NL  discounts: number;" "  returnsTotal: number;$NL  netSales: number;$NL  netSalesExTax: number;$NL  outputTax: number;$NL  discounts: number;"
Rep "        total: true, costTotal: true,$NL        itemDiscountTotal: true" "        total: true, costTotal: true, taxTotal: true,$NL        itemDiscountTotal: true"
Rep "  const netSales = money(gross - returnsTotal).toNumber();$NL  return {" "  const netSales = money(gross - returnsTotal).toNumber();$NL  const outputTax = n2(agg._sum?.taxTotal);$NL  return {"
Rep "    netSales,$NL    discounts:" "    netSales,$NL    netSalesExTax: money(netSales - outputTax).toNumber(),$NL    outputTax,$NL    discounts:"
# --- PurchasesSummary ---
Rep "  due: number;$NL  returnsTotal: number;" "  due: number;$NL  inputTax: number;$NL  returnsTotal: number;"
Rep "paidAmount: true, dueAmount: true }," "paidAmount: true, dueAmount: true, taxTotal: true },"
Rep "    due: n2(agg._sum?.dueAmount),$NL    returnsTotal:" "    due: n2(agg._sum?.dueAmount),$NL    inputTax: n2(agg._sum?.taxTotal),$NL    returnsTotal:"
# --- ProfitReport ---
Rep "export interface ProfitReport {$NL  netSales: number;$NL  cogs:" "export interface ProfitReport {$NL  netSales: number;$NL  netSalesExTax: number;$NL  cogs:"
Rep "      _sum: { total: true, costTotal: true },$NL      where: { saleDate:" "      _sum: { total: true, costTotal: true, taxTotal: true },$NL      where: { saleDate:"
Rep "ret_cogs: string; expenses: string }[]>" "ret_cogs: string; tax: string; expenses: string }[]>"
Rep "0)::text AS ret_cogs," "0)::text AS ret_cogs,$NL        COALESCE((SELECT SUM(s.\"taxTotal\") FROM sales s$NL          WHERE date_trunc('month', s.\"saleDate\") = m.bucket AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')), 0)::text AS tax,"
Rep "  const netSales = money(n2(salesAgg._sum?.total) - returnsTotal).toNumber();$NL  const grossProfit" "  const netSales = money(n2(salesAgg._sum?.total) - returnsTotal).toNumber();$NL  const salesTax = n2(salesAgg._sum?.taxTotal);$NL  const netSalesExTax = money(netSales - salesTax).toNumber();$NL  const grossProfit"
Rep "const grossProfit = money(netSales - netCogs).toNumber();" "const grossProfit = money(netSalesExTax - netCogs).toNumber();"
Rep "  return {$NL    netSales,$NL    cogs: netCogs," "  return {$NL    netSales,$NL    netSalesExTax,$NL    cogs: netCogs,"
Rep "      const sales = n2(m.sales) - n2(m.returns);" "      const sales = n2(m.sales) - n2(m.returns) - n2(m.tax);"
# --- financialSummary wiring ---
Rep "  const [profit, inventory, customers, suppliers] = await Promise.all([" "  const [profit, inventory, customers, suppliers, tax] = await Promise.all(["
Rep "    suppliersReport(range),$NL  ]);$NL  return {" "    suppliersReport(range),$NL    taxReport(range),$NL  ]);$NL  return {"
Rep "    payables: suppliers.totals.payables,$NL  };" "    payables: suppliers.totals.payables,$NL    tax,$NL  };"
# --- taxReport function ---
if (-not $s.Contains("export async function taxReport")) {
  $fn = @'

// ---------------------------------------------------------------------------
// TAX REPORT (VAT position) - output (sales) vs input (purchases)
// ---------------------------------------------------------------------------

export interface TaxMonthRow {
  month: string;
  output: number;
  input: number;
  net: number;
}

export async function taxReport(range: ReportRange) {
  const [outRows, inRows] = await Promise.all([
    db.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT date_trunc('month', s."saleDate") AS bucket, COALESCE(SUM(s."taxTotal"), 0) AS total
      FROM sales s
      WHERE s."saleDate" >= ${range.from} AND s."saleDate" < ${range.to}
        AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED')
      GROUP BY bucket ORDER BY bucket ASC`,
    db.$queryRaw<{ bucket: Date; total: string }[]>`
      SELECT date_trunc('month', p."date") AS bucket, COALESCE(SUM(p."taxTotal"), 0) AS total
      FROM purchases p
      WHERE p."date" >= ${range.from} AND p."date" < ${range.to}
      GROUP BY bucket ORDER BY bucket ASC`,
  ]);
  const byMonth = new Map<string, { output: number; input: number }>();
  for (const r of outRows) {
    const k = dayKey(new Date(r.bucket)).slice(0, 7);
    const e = byMonth.get(k) ?? { output: 0, input: 0 };
    e.output = n2(r.total);
    byMonth.set(k, e);
  }
  for (const r of inRows) {
    const k = dayKey(new Date(r.bucket)).slice(0, 7);
    const e = byMonth.get(k) ?? { output: 0, input: 0 };
    e.input = n2(r.total);
    byMonth.set(k, e);
  }
  const monthly: TaxMonthRow[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, output: v.output, input: v.input, net: money(v.output - v.input).toNumber() }));
  const outputTax = money(monthly.reduce((a, m) => a + m.output, 0)).toNumber();
  const inputTax = money(monthly.reduce((a, m) => a + m.input, 0)).toNumber();
  return { outputTax, inputTax, netPayable: money(outputTax - inputTax).toNumber(), monthly };
}
'@
  $banner = "// ---------------------------------------------------------------------------$NL// INVENTORY VALUATION REPORT"
  if ($s.Contains($banner)) { $s = $s.Replace($banner, ($fn + $NL + $banner)); Write-Output "OK taxReport inserted" }
  else { Write-Output "MISS taxReport banner" }
} else { Write-Output "SKIP taxReport exists" }
[IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding($false)))
Copy-Item -LiteralPath $p -Destination "$root\backups\snapshot-taxfix\reports-service-FIXED.ts" -Force
Write-Output "WROTE + BACKED UP"
