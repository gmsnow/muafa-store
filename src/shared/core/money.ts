import Decimal from "decimal.js";

// Financial accuracy (spec §47):
// - All arithmetic goes through Decimal.js, never raw floats.
// - Rounding rule: HALF_UP applied once at document line/document totals.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 20 });

export type Numeric = Decimal | string | number;

/** Parse into Decimal; null/undefined/invalid become 0. */
export function D(value: Numeric | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/** Round to money precision (2 dp) — returns Decimal. Accepts null/undefined as 0. */
export function money(value: Numeric | null | undefined): Decimal {
  return D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Round to quantity precision (3 dp) — returns Decimal. */
export function qty(value: Numeric): Decimal {
  return D(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);
}

/** Line total = qty * unitPrice - discount, rounded to money. */
export function lineTotal(quantity: Numeric, unitPrice: Numeric, discount: Numeric = 0): Decimal {
  return money(qty(quantity).mul(D(unitPrice)).minus(D(discount)));
}

export function sum(values: Numeric[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(D(v)), new Decimal(0));
}

export function toNumber(value: Numeric): number {
  return D(value).toNumber();
}

export function toStringFixed(value: Numeric, places = 2): string {
  return D(value).toFixed(places, Decimal.ROUND_HALF_UP);
}

export const isNegative = (value: Numeric) => D(value).isNegative() && !D(value).isZero();


/**
 * Document-level financial model (authoritative, mirrors PROJECT_MAP.md):
 *   lineNet       = qty*unitPrice - discount
 *   documentTotal = Σ(lineNet) - invoiceDiscount
 *   COGS          = Σ(item.qty * item.costPrice snapshot)
 *   grossProfit   = netRevenue - COGS
 */
export const FINANCIAL_FORMULAS = {
  lineNet: "qty * unitPrice - discount",
  documentTotal: "Σ(lineNet) - invoiceDiscount",
  cogs: "Σ(itemQty * itemCostSnapshot)",
  grossProfit: "netRevenue - COGS",
  netProfit: "grossProfit - expenses",
} as const;
