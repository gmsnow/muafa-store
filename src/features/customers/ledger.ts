import Decimal from "decimal.js";
import { D, type Numeric } from "@/shared/core/money";
import type { CustomerTransactionType } from "@/generated/prisma/client";

/**
 * Signed contribution of a ledger row to a running balance when rebuilding a
 * customer ledger from scratch:
 *   - DEBT / ADJUSTMENT add their magnitude (credit owed grows);
 *   - PAYMENT / REFUND subtract their magnitude.
 *
 * PAYMENT and REFUND rows from sale cancellation/return are stored negated
 * (cancelSale and credit returns push `amount.negated()`), so "PAYMENT
 * subtracts" can only be done by magnitude — negating the stored value would
 * ADD a cancellation back onto the balance. Keep every rebuild site on this
 * function so the convention cannot drift.
 */
export function ledgerDelta(type: CustomerTransactionType, amount: Numeric): Decimal {
  const a = D(amount);
  return type === "PAYMENT" || type === "REFUND" ? a.abs().negated() : a.abs();
}