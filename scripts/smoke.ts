// End-to-end smoke test against the live DB. Run: npx tsx scripts/smoke.ts
import "dotenv/config";
import { db } from "../src/shared/db";
import { createAdjustment } from "../src/features/inventory/service";
import {
  createSale, cancelSale, createSaleReturn, getSaleDetail,
} from "../src/features/sales/service";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const user = await db.user.findFirstOrThrow({ where: { username: "manager" } });

  // ---- pick a product with stock
  const inv = await db.inventory.findFirst({
    where: { quantity: { gt: 5 } },
    include: { product: true },
  });
  if (!inv) throw new Error("no stocked product");
  const product = inv.product;
  console.log(`Using product ${product.sku} ${product.name} qty=${inv.quantity}`);

  // ---- F6 adjustment INCREASE
  console.log("[adjustment +3]");
  const adj = await createAdjustment(user.id, {
    productId: product.id, type: "INCREASE", quantity: 3,
    reason: "smoke-test increase",
  });
  check("adjustment created", Boolean(adj.adjustmentNumber));
  const after = await db.inventory.findUniqueOrThrow({ where: { productId: product.id } });
  check("qty increased", Number(after.quantity) === Number(inv.quantity) + 3,
    `${inv.quantity} -> ${after.quantity}`);

  // ---- F2 sale
  console.log("[sale 2 units]");
  const saleData = await createSale(user.id, {
    items: [{ productId: product.id, quantity: 2 }],
    payments: [{ method: "CASH", amount: 100000 }],
    invoiceDiscount: 0,
  }) as unknown as { saleId: string; invoiceNumber: string; total: string };
  check("sale created", Boolean(saleData?.saleId), JSON.stringify(saleData).slice(0, 300));
  if (!saleData?.saleId) return process.exit(1);

  const detail = await getSaleDetail(saleData.saleId);
  const d = detail as unknown as {
    id: string; invoiceNumber: string; total: string;
    items: { id: string; productId: string; quantity: number; lineTotal: string; costPrice: string }[];
    movementsCount?: number;
  };
  check("invoice number format", /^INV-\d{6}$/.test(d.invoiceNumber), d.invoiceNumber);
  check("cost snapshot > 0", Number(d.items[0].costPrice) > 0, d.items[0].costPrice);
  const qtyAfterSale = await db.inventory.findUniqueOrThrow({ where: { productId: product.id } });
  check("stock decremented", Number(qtyAfterSale.quantity) === Number(after.quantity) - 2,
    `expected ${Number(after.quantity) - 2}, got ${qtyAfterSale.quantity}`);
  const saleMovs = await db.inventoryMovement.count({
    where: { refType: "SaleItem", refId: { in: d.items.map((i) => i.id) }, type: "SALE" },
  });
  check("SALE movements written", saleMovs >= 1, String(saleMovs));

  // overpay → change due
  check("changeDue computed", "changeDue" in d && Number(d.changeDue) >= 0);

  // ---- F3 partial return of 1 unit, restock
  console.log("[return 1 unit restock]");
  let ret: { returnNumber?: string; err?: string };
  try {
    ret = await createSaleReturn(user.id, {
      saleId: d.id,
      items: [{ saleItemId: d.items[0].id, quantity: 1 }],
      reason: "smoke-test return",
      restock: true,
      refundMethod: "CASH",
    }) as { returnNumber: string };
  } catch (e) {
    ret = { err: String(e) };
  }
  check("return ok", !ret.err, ret.err ?? "");
  const qtyAfterRet = await db.inventory.findUniqueOrThrow({ where: { productId: product.id } });
  check("restock restored 1", Number(qtyAfterRet.quantity) === Number(qtyAfterSale.quantity) + 1,
    `got ${qtyAfterRet.quantity}`);
  const detail2 = (await getSaleDetail(d.id)) as unknown as { refundedAmount: string; status: string };
  check("refundedAmount>0 & PARTIALLY_REFUNDED",
    Number(detail2.refundedAmount) > 0 && detail2.status === "PARTIALLY_REFUNDED",
    `${detail2.refundedAmount}/${detail2.status}`);

  // double-return beyond sold must fail
  try {
    await createSaleReturn(user.id, {
      saleId: d.id,
      items: [{ saleItemId: d.items[0].id, quantity: 2 }],
      reason: "over-return attempt",
      restock: true,
      refundMethod: "CASH",
    });
    check("over-return rejected", false, "no error thrown");
  } catch {
    check("over-return rejected", true);
  }

  // cancel-after-refund must be blocked by design
  try {
    await cancelSale(user.id, d.id);
    check("cancel-after-refund blocked", false, "no error thrown");
  } catch {
    check("cancel-after-refund blocked", true);
  }

  // ---- credit sale with customer (auto-credit)
  const cust = await db.customer.findFirstOrThrow();
  const balanceBefore = Number((await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).balance);
  console.log(`[credit sale for customer]`);
  let cs;
  try {
    cs = await createSale(user.id, {
      items: [{ productId: product.id, quantity: 1 }],
      customerId: cust.id,
      payments: [],
      invoiceDiscount: 0,
    }) as unknown as { saleId: string };
    check("credit-only sale ok", Boolean(cs?.saleId));
  } catch (e) {
    cs = null;
    check("credit-only sale ok", false, String(e).slice(0, 200));
  }
  if (cs?.saleId) {
    const cid = cs.saleId;
    const cd = (await getSaleDetail(cid)) as unknown as {
      creditAmount: string; total: string; payments: { method: string }[];
      customer: { id?: string };
    };
    check("creditAmount recorded", Number(cd.creditAmount) === Number(cd.total),
      `${cd.creditAmount} vs ${cd.total}`);
    check("customer balance raised",
      Number((await db.customer.findUniqueOrThrow({ where: { id: cust.id } })).balance) === balanceBefore + Number(cd.total));
    const txn = await db.customerTransaction.count({ where: { customerId: cust.id, type: "DEBT" } });
    check("DEBT transaction", txn >= 1);

    // ---- cancel the untouched credit sale (full reversal)
    console.log("[cancel credit sale]");
    try {
      await cancelSale(user.id, cid);
      check("cancel ok", true);
    } catch (e) {
      check("cancel ok", false, String(e).slice(0, 200));
    }
    const qtyAfterCancel = await db.inventory.findUniqueOrThrow({ where: { productId: product.id } });
    check("cancel restores stock", Number(qtyAfterCancel.quantity) === Number(qtyAfterRet.quantity),
      `${qtyAfterCancel.quantity} vs ${qtyAfterRet.quantity}`);
    const c2 = await db.customer.findUniqueOrThrow({ where: { id: cust.id } });
    check("balance reversed by exact credit amount",
      Number(c2.balance) === balanceBefore,
      `${c2.balance} vs ${balanceBefore}`);
    const detail3 = (await getSaleDetail(cid)) as unknown as { status: string };
    check("status CANCELLED", detail3.status === "CANCELLED");
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} FAILURES`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
