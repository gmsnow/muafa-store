// Procurement smoke test (M6): npx tsx scripts/smoke-procurement.ts
import "dotenv/config";
import { db } from "../src/shared/db";
import {
  saveSupplier, createPurchaseOrder, transitionPo, receivePurchase,
  createPurchaseReturn, getPurchaseForReturn,
} from "../src/features/procurement/service";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const user = await db.user.findFirstOrThrow({ where: { username: "manager" } });

  // ---- supplier create
  const sup = await saveSupplier(null, { name: "Smoke Supplier", phone: "770000001" });
  const supId = sup.id;
  check("supplier created", Boolean(supId) && sup.code.startsWith("SUP-"), sup.code);

  // ---- product for lines
  const product = await db.product.findFirstOrThrow({
    where: { deletedAt: null, isActive: true },
    include: { inventory: true },
  });
  const runBatchNo = `SMOKE-B1-${Date.now()}`;
  const invBefore = Number(product.inventory?.quantity ?? 0);

  // ---- PO create (qty 5 @ cost 100)
  const po = await createPurchaseOrder(user.id, {
    supplierId: supId,
    items: [{ productId: product.id, quantity: 5, unitCost: 100, taxRate: 0 }],
  }) as unknown as { id: string; poNumber: string; status: string; total: unknown };
  check("PO created", /^PO-\d{6}$/.test(po.poNumber), po.poNumber);
  check("PO starts PENDING", po.status === "PENDING");

  // invalid transitions blocked (approve before submit? our machine: PENDING→APPROVED allowed directly)
  let badState = false;
  try { await transitionPo(user.id, po.id, "order"); } catch { badState = true; }
  check("order-from-PENDING blocked", badState);

  await transitionPo(user.id, po.id, "approve");
  const approved = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  check("approved", approved.status === "APPROVED");

  // ---- partial receive: 2 units paid 0
  const r1 = await receivePurchase(user.id, {
    supplierId: supId, purchaseOrderId: po.id, paidAmount: 0,
    items: [{
      productId: product.id, quantity: 2, unitCost: 100, taxRate: 0,
      batchNo: runBatchNo, expDate: "2099-01-01",
    }],
  }) as unknown as { purchaseNumber: string; total: number; due: number };
  check("partial receive ok", /^PUR-\d{6}$/.test(r1.purchaseNumber), r1.purchaseNumber);
  check("receive total = 200", r1.total === 200, String(r1.total));
  check("due = 200", r1.due === 200);
  let poNow = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  check("PO PARTIALLY_RECEIVED", poNow.status === "PARTIALLY_RECEIVED");
  const invMid = await db.inventory.findUniqueOrThrow({ where: { productId: product.id } });
  check("stock +2", Number(invMid.quantity) === invBefore + 2, `${invBefore}→${invMid.quantity}`);
  const batch = await db.productBatch.findFirstOrThrow({
    where: { productId: product.id, batchNo: runBatchNo },
  });
  check("batch created w/ cost snapshot", Number(batch.quantity) === 2 && Number(batch.costPrice) === 100);
  const movs = await db.inventoryMovement.count({
    where: { productId: product.id, type: "PURCHASE", refType: "Purchase" },
  });
  check("PURCHASE movements", movs >= 1);
  let supNow = await db.supplier.findUniqueOrThrow({ where: { id: supId } });
  check("supplier balance += due", Number(supNow.balance) === 200, String(supNow.balance));

  // ---- over-receipt blocked (try 4 more when only 3 open)
  let overReceipt = false;
  try {
    await receivePurchase(user.id, {
      supplierId: supId, purchaseOrderId: po.id, paidAmount: 0,
      items: [{ productId: product.id, quantity: 4, unitCost: 100 }],
    });
  } catch (e) {
    overReceipt = String(e).includes("OVER_RECEIPT") || String(e).includes("open");
  }
  check("over-receipt blocked", overReceipt);

  // ---- receive remainder 3, pay 150
  const r2 = await receivePurchase(user.id, {
    supplierId: supId, purchaseOrderId: po.id, paidAmount: 150,
    items: [{ productId: product.id, quantity: 3, unitCost: 100 }],
  }) as unknown as { due: number };
  check("remainder received", r2.due === 150);
  poNow = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  check("PO RECEIVED", poNow.status === "RECEIVED");
  supNow = await db.supplier.findUniqueOrThrow({ where: { id: supId } });
  check("balance now 350", Number(supNow.balance) === 350, String(supNow.balance));

  // ---- F5 return: 1 unit at cost 100, CASH refund
  const purchases = await db.purchase.findMany({ where: { purchaseOrderId: po.id }, orderBy: { date: "asc" } });
  const firstPurchase = purchases[0]!;
  const forReturn = await getPurchaseForReturn(firstPurchase.id);
  const line = forReturn.items[0]!;
  check("maxReturnable math", line.maxReturnable === "2", line.maxReturnable);

  const ret = await createPurchaseReturn(user.id, {
    purchaseId: firstPurchase.id,
    reason: "smoke damaged items",
    refundMethod: "CASH",
    items: [{ productId: product.id, quantity: 1, unitCost: 100 }],
  }) as unknown as { returnNumber: string; total: number };
  check("return created", /^PRE-\d{6}$/.test(ret.returnNumber), ret.returnNumber);
  const retRow = await db.purchaseReturn.findFirstOrThrow({
    where: { returnNumber: ret.returnNumber }, include: { items: true },
  });
  check("refundAmount recorded", Number(retRow.refundAmount) === 100 && Number(retRow.creditAmount) === 0);
  const invAfterRet = await db.inventory.findUniqueOrThrow({ where: { productId: product.id } });
  check("stock -1 after return", Number(invAfterRet.quantity) === invBefore + 4, `${invAfterRet.quantity}`);

  // over-return beyond cap blocked
  let overReturn = false;
  try {
    await createPurchaseReturn(user.id, {
      purchaseId: firstPurchase.id,
      reason: "over-return attempt",
      refundMethod: "CASH",
      items: [{ productId: product.id, quantity: 2, unitCost: 100 }],
    });
  } catch (e) {
    overReturn = String(e).includes("OVER_RETURN") || String(e).includes("returnable");
  }
  check("over-return blocked", overReturn);

  // second receipt still fully payable → pay down
  const secondPurchase = purchases[1]!;
  const payRes = await import("../src/features/procurement/service").then(({ payPurchase }) =>
    payPurchase(user.id, { purchaseId: secondPurchase.id, amount: 150, method: "CASH" }));
  check("pay clears dues", payRes.dueAmount === "0", payRes.dueAmount);
  supNow = await db.supplier.findUniqueOrThrow({ where: { id: supId } });
  check("supplier balance back to 200", Number(supNow.balance) === 200, String(supNow.balance));

  console.log(failures === 0 ? "\nALL PROCUREMENT CHECKS PASSED" : `\n${failures} FAILURES`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
