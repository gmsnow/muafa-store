 
// Development seed: realistic grocery dataset (spec §43-44). Deterministic RNG.
// Run: npm run db:seed   |   Full reset: npm run db:reset
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const db = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? "postgresql://localhost:5432/grocery_db", { schema: "public" }),
});

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000);
const pad = (n: number, len = 6) => String(n).padStart(len, "0");
const m2 = (n: number) => n.toFixed(2);
const m3 = (n: number) => n.toFixed(3);
const DEV_PASSWORD = "Dev@12345"; // development-only credentials (spec §44)

interface SaleDraft {
  customerId: string | null;
  cashierId: string;
  date: Date;
  items: { productId: string; productName: string; nameAr: string; sku: string; qty: number; unitPrice: number; cost: number }[];
  payments: { method: "CASH" | "CARD" | "CREDIT"; amount: number }[];
  notes?: string;
}

async function main() {
  console.log("→ wiping existing data…");
  await wipe();

  // ── RBAC ────────────────────────────────────────────────────────────────
  const { PERMISSIONS, ROLE_MATRIX, ROLE_NAMES_AR } = await import("../src/shared/auth/rbac");
  await db.permission.createMany({ data: PERMISSIONS.map((p) => ({ key: p.key, description: p.description, group: p.group })) });
  for (const [roleName, keys] of Object.entries(ROLE_MATRIX)) {
    const role = await db.role.create({ data: { name: roleName, nameAr: ROLE_NAMES_AR[roleName] ?? null, isSystem: true } });
    const perms = keys === "*" ? PERMISSIONS.map((p) => p.key) : keys;
    await db.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
  }
  const roleId = Object.fromEntries((await db.role.findMany()).map((r) => [r.name, r.id]));

  // ── Users ────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);
  for (const u of [
    ["superadmin", "superadmin@example.com", "System Super Admin", "مدير النظام", "SUPER_ADMIN"],
    ["admin", "admin@example.com", "Store Administrator", "مسؤول المتجر", "ADMINISTRATOR"],
    ["manager", "manager@example.com", "Store Manager", "مدير المتجر", "MANAGER"],
    ["cashier", "cashier@example.com", "Front Cashier", "أمين الصندوق", "CASHIER"],
    ["cashier2", "cashier2@example.com", "Evening Cashier", "أمين الصندوق المسائي", "CASHIER"],
    ["inventory", "inventory@example.com", "Inventory Manager", "مدير المخزون", "INVENTORY_MANAGER"],
    ["accountant", "accountant@example.com", "Chief Accountant", "المحاسب الرئيسي", "ACCOUNTANT"],
  ] as const) {
    await db.user.create({
      data: { username: u[0], email: u[1], fullName: u[2], fullNameAr: u[3], passwordHash, roleId: roleId[u[4]], status: "ACTIVE" },
    });
  }
  const adminUser = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
  const invUser = await db.user.findUniqueOrThrow({ where: { username: "inventory" } });
  const cashiers = await db.user.findMany({ where: { role: { name: "CASHIER" } } });

  // ── Units ────────────────────────────────────────────────────────────────
  for (const [name, nameAr, symbol] of [
    ["Piece", "حبة", "pcs"], ["Box", "كرتونة", "box"], ["Carton", "صندوق", "ctn"],
    ["Kilogram", "كيلوغرام", "kg"], ["Gram", "غرام", "g"], ["Liter", "لتر", "L"],
    ["Bottle", "زجاجة", "btl"], ["Pack", "عبوة", "pk"],
  ] as const) {
    await db.unit.create({ data: { name, nameAr, symbol, isBase: name === "Piece" } });
  }
  const units = Object.fromEntries((await db.unit.findMany()).map((u) => [u.name, u.id]));
  for (const [from, to, factor] of [["Box", "Piece", 12], ["Carton", "Piece", 24], ["Pack", "Piece", 6], ["Kilogram", "Gram", 1000]] as const) {
    await db.unitConversion.create({ data: { fromUnitId: units[from], toUnitId: units[to], factor } });
  }

  // ── Categories ───────────────────────────────────────────────────────────
  async function addCategory(name: string, nameAr: string, parentId?: string): Promise<string> {
    return (await db.category.create({ data: { name, nameAr, parentId } })).id;
  }
  const catFood = await addCategory("Food", "مواد غذائية");
  const catBeverages = await addCategory("Beverages", "مشروبات", catFood);
  const catSoft = await addCategory("Soft Drinks", "مشروبات غازية", catBeverages);
  const catWater = await addCategory("Water", "مياه", catBeverages);
  const catJuice = await addCategory("Juice", "عصائر", catBeverages);
  const catDairy = await addCategory("Dairy & Eggs", "ألبان وبيض", catFood);
  const catGrains = await addCategory("Grains & Staples", "حبوب ومواد أساسية", catFood);
  const catPantry = await addCategory("Pantry", "مؤن المطبخ", catFood);
  const catSnacks = await addCategory("Snacks", "وجبات خفيفة", catFood);
  const catHousehold = await addCategory("Household", "مستلزمات منزلية");

  // ── Brands ───────────────────────────────────────────────────────────────
  for (const [name, nameAr] of [
    ["Almarai", "المراعي"], ["Nadec", "نادك"], ["Coca-Cola", "كوكاكولا"], ["Pepsi", "بيبسي"],
    ["Nestlé", "نستله"], ["Lipton", "ليبتون"], ["Indomie", "إندومي"], ["Tide", "تايد"],
    ["Fine", "فين"], ["Local Farm", "المزرعة المحلية"], ["Al-Ameed", "الحميد"], ["Pringles", "برينجلز"],
  ]) {
    await db.brand.create({ data: { name, nameAr } });
  }
  const brands = Object.fromEntries((await db.brand.findMany()).map((b) => [b.name, b.id]));

  // ── Products ─────────────────────────────────────────────────────────────
  interface PDef { sku: string; name: string; nameAr: string; cat: string; brand?: string; cost: number; sell: number; wsell: number; expiry?: boolean; batches?: boolean; minStock?: number; reorder?: number }
  const productDefs: PDef[] = [
    { sku: "WTR-05", name: "Water 500ml", nameAr: "ماء ٥٠٠ مل", cat: catWater, brand: "Local Farm", cost: 50, sell: 100, wsell: 80, expiry: true },
    { sku: "WTR-15", name: "Water 1.5L", nameAr: "ماء ١٫٥ لتر", cat: catWater, brand: "Local Farm", cost: 90, sell: 150, wsell: 120, expiry: true },
    { sku: "COLA-33", name: "Coca-Cola 330ml", nameAr: "كوكاكولا ٣٣٠ مل", cat: catSoft, brand: "Coca-Cola", cost: 140, sell: 250, wsell: 200, batches: true },
    { sku: "PEPS-33", name: "Pepsi 330ml", nameAr: "بيبسي ٣٣٠ مل", cat: catSoft, brand: "Pepsi", cost: 130, sell: 240, wsell: 195, batches: true },
    { sku: "OJ-1L", name: "Orange Juice 1L", nameAr: "عصير برتقال ١ لتر", cat: catJuice, brand: "Nadec", cost: 550, sell: 800, wsell: 700, expiry: true, batches: true },
    { sku: "MLK-1L", name: "Milk 1L", nameAr: "حليب ١ لتر", cat: catDairy, brand: "Almarai", cost: 900, sell: 1200, wsell: 1050, expiry: true, batches: true },
    { sku: "YOG-500", name: "Yogurt 500g", nameAr: "زبادي ٥٠٠ غرام", cat: catDairy, brand: "Almarai", cost: 450, sell: 650, wsell: 560, expiry: true, batches: true },
    { sku: "CHS-400", name: "Cheese Slices 400g", nameAr: "جبن شرائح ٤٠٠ غرام", cat: catDairy, brand: "Almarai", cost: 850, sell: 1150, wsell: 1000, expiry: true, batches: true },
    { sku: "EGG-30", name: "Eggs Tray 30", nameAr: "طبق بيض ٣٠ حبة", cat: catDairy, brand: "Local Farm", cost: 3200, sell: 3900, wsell: 3550, expiry: true, batches: true },
    { sku: "RIC-5", name: "Rice 5kg", nameAr: "أرز ٥ كغ", cat: catGrains, brand: "Al-Ameed", cost: 5200, sell: 6500, wsell: 5900, minStock: 10, reorder: 15 },
    { sku: "RIC-10", name: "Rice 10kg", nameAr: "أرز ١٠ كغ", cat: catGrains, brand: "Al-Ameed", cost: 9800, sell: 12500, wsell: 11200, minStock: 5, reorder: 8 },
    { sku: "SGR-1", name: "Sugar 1kg", nameAr: "سكر ١ كغ", cat: catGrains, cost: 750, sell: 950, wsell: 860 },
    { sku: "FLR-1", name: "Flour 1kg", nameAr: "دقيق ١ كغ", cat: catGrains, cost: 600, sell: 800, wsell: 700 },
    { sku: "OIL-15", name: "Vegetable Oil 1.5L", nameAr: "زيت نباتي ١٫٥ لتر", cat: catGrains, cost: 2100, sell: 2700, wsell: 2450, expiry: true },
    { sku: "OIL-5", name: "Sunflower Oil 5L", nameAr: "زيت عباد الشمس ٥ لتر", cat: catGrains, cost: 7800, sell: 9800, wsell: 8900, expiry: true },
    { sku: "BRD-LF", name: "Bread Loaf", nameAr: "خبزة", cat: catGrains, cost: 100, sell: 200, wsell: 150, expiry: true },
    { sku: "TEA-450", name: "Tea 450g", nameAr: "شاي ٤٥٠ غرام", cat: catPantry, brand: "Lipton", cost: 1900, sell: 2450, wsell: 2200 },
    { sku: "COF-250", name: "Coffee 250g", nameAr: "قهوة ٢٥٠ غرام", cat: catPantry, brand: "Nestlé", cost: 2300, sell: 2900, wsell: 2600 },
    { sku: "PAS-400", name: "Pasta 400g", nameAr: "مكرونة ٤٠٠ غرام", cat: catPantry, brand: "Indomie", cost: 260, sell: 400, wsell: 340 },
    { sku: "SPG-700", name: "Spaghetti 700g", nameAr: "سباجيتي ٧٠٠ غرام", cat: catPantry, brand: "Indomie", cost: 420, sell: 600, wsell: 520 },
    { sku: "TOM-400", name: "Tomato Paste 400g", nameAr: "معجون طماطم ٤٠٠ غرام", cat: catPantry, cost: 380, sell: 550, wsell: 480, expiry: true },
    { sku: "SLT-750", name: "Salt 750g", nameAr: "ملح ٧٥٠ غرام", cat: catPantry, cost: 120, sell: 200, wsell: 170 },
    { sku: "LEN-1", name: "Lentils 1kg", nameAr: "عدس ١ كغ", cat: catGrains, cost: 1100, sell: 1450, wsell: 1300 },
    { sku: "BNS-1", name: "Beans 1kg", nameAr: "فاصوليا ١ كغ", cat: catGrains, cost: 1250, sell: 1600, wsell: 1450 },
    { sku: "CNF-375", name: "Corn Flakes 375g", nameAr: "كورن فليكس ٣٧٥ غرام", cat: catSnacks, brand: "Nestlé", cost: 1450, sell: 1900, wsell: 1700, expiry: true },
    { sku: "BSC-CHO", name: "Chocolate Biscuits", nameAr: "بسكويت شوكولاتة", cat: catSnacks, brand: "Nestlé", cost: 300, sell: 500, wsell: 420, expiry: true },
    { sku: "CHO-BAR", name: "Chocolate Bar", nameAr: "لوح شوكولاتة", cat: catSnacks, brand: "Nestlé", cost: 350, sell: 600, wsell: 500, expiry: true },
    { sku: "CHP-PRG", name: "Potato Chips Can", nameAr: "شيبس علبة", cat: catSnacks, brand: "Pringles", cost: 950, sell: 1350, wsell: 1180, expiry: true },
    { sku: "DSH-SAP", name: "Dish Soap 750ml", nameAr: "سائل جلي ٧٥٠ مل", cat: catHousehold, brand: "Fine", cost: 520, sell: 750, wsell: 650 },
    { sku: "LND-2KG", name: "Laundry Powder 2kg", nameAr: "مسحوق غسيل ٢ كغ", cat: catHousehold, brand: "Tide", cost: 2400, sell: 3100, wsell: 2800 },
    { sku: "BLH-1L", name: "Bleach 1L", nameAr: "مبيض ١ لتر", cat: catHousehold, cost: 380, sell: 560, wsell: 480, expiry: true },
    { sku: "SHM-400", name: "Shampoo 400ml", nameAr: "شامبو ٤٠٠ مل", cat: catHousehold, brand: "Nestlé", cost: 1250, sell: 1650, wsell: 1480, expiry: true },
    { sku: "TTH-120", name: "Toothpaste 120ml", nameAr: "معجون أسنان ١٢٠ مل", cat: catHousehold, cost: 480, sell: 700, wsell: 600 },
    { sku: "TSU-BOX", name: "Facial Tissue Box", nameAr: "علبة مناديل", cat: catHousehold, brand: "Fine", cost: 320, sell: 500, wsell: 430 },
    { sku: "PTW-RL", name: "Paper Towel Roll x4", nameAr: "مناديل مطبخ ٤ لفات", cat: catHousehold, brand: "Fine", cost: 850, sell: 1150, wsell: 1020 },
    { sku: "TRB-BAG", name: "Trash Bags 20pc", nameAr: "أكياس قمامة ٢٠ حبة", cat: catHousehold, cost: 420, sell: 620, wsell: 540 },
    { sku: "FOI-RL", name: "Aluminum Foil Roll", nameAr: "لفة قصدير", cat: catHousehold, cost: 560, sell: 800, wsell: 700 },
    { sku: "MTB-10", name: "Matchbox 10pc", nameAr: "كريت ١٠ علب", cat: catHousehold, cost: 180, sell: 300, wsell: 250 },
    { sku: "BAT-AA4", name: "AA Batteries 4pc", nameAr: "بطاريات AA × ٤", cat: catHousehold, cost: 700, sell: 1000, wsell: 880, expiry: true },
    { sku: "IND-70", name: "Instant Noodles 70g", nameAr: "نودلز سريعة ٧٠ غرام", cat: catPantry, brand: "Indomie", cost: 130, sell: 220, wsell: 185, expiry: true },
    { sku: "HNY-500", name: "Natural Honey 500g", nameAr: "عسل طبيعي ٥٠٠ غرام", cat: catPantry, cost: 4200, sell: 5500, wsell: 4900, expiry: true, batches: true },
    { sku: "DAT-1", name: "Dates 1kg", nameAr: "تمور ١ كغ", cat: catSnacks, cost: 2800, sell: 3700, wsell: 3300, expiry: true, batches: true },
  ];
  const products: { id: string; def: PDef }[] = [];
  for (let i = 0; i < productDefs.length; i++) {
    const d = productDefs[i];
    const p = await db.product.create({
      data: {
        sku: d.sku,
        barcode: `62${pad(int(100000000, 999999999), 11)}${i % 10}`,
        name: d.name, nameAr: d.nameAr,
        categoryId: d.cat, brandId: d.brand ? brands[d.brand] : null, unitId: units["Piece"],
        costPrice: m2(d.cost), sellingPrice: m2(d.sell), wholesalePrice: m2(d.wsell),
        minPrice: m2(Math.round(d.cost * 1.05)), taxRate: "0",
        minStock: m3(d.minStock ?? int(6, 20)), reorderLevel: m3(d.reorder ?? int(18, 40)),
        maxStock: m3(int(150, 400)),
        trackExpiry: !!d.expiry, trackBatches: !!d.batches || !!d.expiry,
      },
    });
    products.push({ id: p.id, def: d });
  }

  // ── Suppliers ────────────────────────────────────────────────────────────
  const suppliers: { id: string }[] = [];
  for (let i = 0; i < 6; i++) {
    const defs = [
      ["SUP-001", "Almarai Distribution", "توزيع المراعي"], ["SUP-002", "National Beverage Co.", "شركة المشروبات الوطنية"],
      ["SUP-003", "Golden Grains Trading", "تجارة الحبوب الذهبية"], ["SUP-004", "Clean House Supplies", "مستلزمات البيت النظيفة"],
      ["SUP-005", "Yemen Food Importers", "مستوردو الأغذية اليمنية"], ["SUP-006", "Fresh Dairy Farms", "مزارع الألبان الطازجة"],
    ] as const;
    const [code, name, nameAr] = defs[i];
    const s = await db.supplier.create({
      data: {
        code, name, nameAr, company: `${name} Ltd.`,
        phone: `77${int(10000000, 99999999)}`, email: `sales@${code.toLowerCase()}.ye`,
        address: "Sana'a Industrial Area", taxNumber: `TX-${int(100000, 999999)}`,
        creditLimit: m2(int(500000, 3000000)), paymentTerms: pick(["Net 15", "Net 30", "Cash on delivery"]),
      },
    });
    suppliers.push({ id: s.id });
  }

  // ── Customers ────────────────────────────────────────────────────────────
  const groupIds = Object.fromEntries(
    await Promise.all(
      [
        { name: "Retail", nameAr: "قطاعي", discountRate: "0", priceMode: "retail" },
        { name: "Wholesale", nameAr: "جملة", discountRate: "5", priceMode: "wholesale" },
        { name: "VIP", nameAr: "مميز", discountRate: "7", priceMode: "retail" },
        { name: "Credit Account", nameAr: "حساب آجل", discountRate: "0", priceMode: "wholesale" },
      ].map(async (g) => [g.name, (await db.customerGroup.create({ data: g })).id]),
    ),
  );
  const firstNames = ["Ahmed", "Mohammed", "Ali", "Fatima", "Salma", "Yousef", "Omar", "Nour", "Layla", "Hassan"];
  const lastNames = ["Al-Sabri", "Al-Haddi", "Saleh", "Al-Qadhi", "Naji", "Al-Ansi", "Murshed", "Al-Sharabi"];
  const customers: { id: string; groupName: string; points: number }[] = [];
  for (let i = 1; i <= 24; i++) {
    const groupName = i <= 14 ? "Retail" : i <= 19 ? "Wholesale" : i <= 21 ? "VIP" : "Credit Account";
    const name = `${pick(firstNames)} ${pick(lastNames)}`;
    const points = int(0, 800);
    const c = await db.customer.create({
      data: {
        code: `CUS-${pad(i, 4)}`, name, phone: `71${int(10000000, 99999999)}`,
        groupId: groupIds[groupName],
        creditLimit: groupName === "Credit Account" ? m2(int(100000, 500000)) : "0",
        loyaltyPoints: m2(points),
      },
    });
    customers.push({ id: c.id, groupName, points });
  }
  const pointsBalance = new Map<string, number>(customers.map((c) => [c.id, c.points]));

  // ── Settings ─────────────────────────────────────────────────────────────
  await db.storeSettings.create({
    data: {
      id: "store", name: "Al-Rahma Grocery", nameAr: "بقالة الرحمة",
      address: "Sana'a, Al-Hasabah St., Yemen", addressAr: "صنعاء، شارع الحصبة، اليمن",
      phone: "+967-771-234567", email: "info@alrahma-grocery.ye",
      taxNumber: "TX-2026-004512", currencyCode: "YER", currencySymbol: "ر.ي",
      receiptFooter: "Thank you for shopping with us! / شكراً لتسوقكم معنا",
    },
  });
  await db.systemSettings.create({
    data: {
      id: "system", expirationWarningDays: 30, enableLoyalty: true,
      loyaltyEarnPerSpent: "1", loyaltyPointValue: "1",
      language: "ar", timezone: "Asia/Aden",
    },
  });

  // ── Purchases → stock in (with batches & movements) ─────────────────────
  console.log("→ seeding purchases…");
  interface BatchRef { id: string; remaining: number; expiry: Date | null }
  const batchesByProduct = new Map<string, BatchRef[]>();
  const purchasedQty = new Map<string, number>();
  const soldQty = new Map<string, number>();
  let poSeq = 0;

  for (let round = 0; round < 4; round++) {
    const chosen = products.filter(() => rand() < 0.45).slice(0, 14);
    if (!chosen.length) continue;
    const supplier = pick(suppliers);
    const orderDate = daysAgo(120 - round * 28);

    poSeq++;
    const lines = chosen.map(({ id, def }) => {
      const quantity = int(40, 140);
      return { productId: id, def, quantity, unitCost: def.cost, lineTotal: quantity * def.cost };
    });
    const poTotal = lines.reduce((a, l) => a + l.lineTotal, 0);

    const receiveDate = new Date(orderDate.getTime() + 5 * 86400000);
    const purchase = await db.purchase.create({
      data: {
        purchaseNumber: `GRN-${pad(poSeq)}`,
        supplierId: supplier.id, userId: invUser.id, date: receiveDate,
        subtotal: m2(poTotal), total: m2(poTotal),
        paidAmount: m2(poTotal), dueAmount: "0", notes: `Received against PO-${pad(poSeq)}`,
      },
    });
    await db.purchaseOrder.create({
      data: {
        poNumber: `PO-${pad(poSeq)}`, supplierId: supplier.id, userId: adminUser.id,
        orderDate, expectedDate: receiveDate, status: "RECEIVED",
        subtotal: m2(poTotal), total: m2(poTotal),
        items: {
          create: lines.map((l) => ({
            productId: l.productId, quantity: m3(l.quantity), receivedQty: m3(l.quantity),
            unitCost: m2(l.unitCost), lineTotal: m2(l.lineTotal),
          })),
        },
      },
    });

    for (const l of lines) {
      let batchId: string | null = null;
      let itemBatchNo: string | null = null;
      if (l.def.batches || l.def.expiry) {
        const mfgDate = new Date(receiveDate.getTime() - int(20, 60) * 86400000);
        const expDate = new Date(mfgDate.getTime() + pick([45, 75, 120, 200, 365]) * 86400000);
        const batch = await db.productBatch.create({
          data: {
            productId: l.productId, batchNo: `B${poSeq}-${l.def.sku}`,
            mfgDate, expiryDate: expDate, quantity: m3(l.quantity),
            costPrice: m2(l.unitCost), supplierId: supplier.id,
          },
        });
        batchId = batch.id;
        itemBatchNo = batch.batchNo;
        const list = batchesByProduct.get(l.productId) ?? [];
        list.push({ id: batch.id, remaining: l.quantity, expiry: expDate });
        batchesByProduct.set(l.productId, list);
      }
      await db.purchaseItem.create({
        data: {
          purchaseId: purchase.id, productId: l.productId,
          batchNo: itemBatchNo,
          mfgDate: null, expDate: null,
          quantity: m3(l.quantity), unitCost: m2(l.unitCost), lineTotal: m2(l.lineTotal),
        },
      });
      await db.inventoryMovement.create({
        data: {
          productId: l.productId, batchId, type: "PURCHASE",
          quantity: m3(l.quantity), unitCost: m2(l.unitCost),
          refType: "Purchase", refId: purchase.id,
          userId: invUser.id, createdAt: receiveDate,
        },
      });
      purchasedQty.set(l.productId, (purchasedQty.get(l.productId) ?? 0) + l.quantity);
    }
  }

  // ── Sales (90 days) ──────────────────────────────────────────────────────
  console.log("→ seeding sales…");
  const drafts: SaleDraft[] = [];
  for (let i = 0; i < 170; i++) {
    const daySkew = Math.pow(rand(), 1.6);
    const date = new Date(Date.now() - Math.floor(daySkew * 88) * 86400000 - int(9, 21) * 3600000 - int(0, 59) * 60000);
    const itemCount = int(1, 5);
    const chosenProducts: typeof products = [];
    while (chosenProducts.length < itemCount) {
      const p = pick(products);
      if (!chosenProducts.includes(p)) chosenProducts.push(p);
    }
    const customerRoll = rand();
    let customerId: string | null = null;
    if (customerRoll > 0.35) {
      const c = pick(customers);
      customerId = c.id;
    }
    const isCredit = !!customerId && rand() < 0.18;
    const items = chosenProducts.map(({ id, def }) => ({ productId: id, productName: def.name, nameAr: def.nameAr, sku: def.sku, qty: int(1, 6), unitPrice: def.sell, cost: def.cost }));
    const total = items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
    drafts.push({
      customerId,
      cashierId: pick(cashiers).id,
      date,
      items,
      payments: isCredit ? [{ method: "CREDIT", amount: total }] : rand() < 0.72 ? [{ method: "CASH", amount: total }] : [{ method: "CARD", amount: total }],
    });
  }
  drafts.sort((a, b) => a.date.getTime() - b.date.getTime());

  let invoiceSeq = 0;
  const customerAgg = new Map<string, { total: number; balanceDelta: number; points: number }>();
  for (const draft of drafts) {
    invoiceSeq++;
    const subtotal = draft.items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
    const costTotal = draft.items.reduce((a, it) => a + it.qty * it.cost, 0);
    const paidTotal = draft.payments.filter((p) => p.method !== "CREDIT").reduce((a, p) => a + p.amount, 0);
    const creditAmount = subtotal - paidTotal;
    const pointsEarned = draft.customerId ? Math.floor(subtotal / 100) : 0;

    const sale = await db.sale.create({
      data: {
        invoiceNumber: `INV-${pad(invoiceSeq)}`,
        customerId: draft.customerId, cashierId: draft.cashierId, saleDate: draft.date,
        status: "COMPLETED",
        subtotal: m2(subtotal), total: m2(subtotal), costTotal: m2(costTotal),
        paidTotal: m2(paidTotal), creditAmount: m2(creditAmount),
        loyaltyPointsEarned: m2(pointsEarned),
        items: {
          create: draft.items.map((it) => ({
            productId: it.productId, productName: it.productName, productNameAr: it.nameAr,
            sku: it.sku, quantity: m3(it.qty), unitPrice: m2(it.unitPrice),
            costPrice: m2(it.cost), lineTotal: m2(it.qty * it.unitPrice),
          })),
        },
        payments: { create: draft.payments.map((p) => ({ method: p.method, amount: m2(p.amount) })) },
        createdAt: draft.date, updatedAt: draft.date,
      },
    });

    for (const it of draft.items) {
      soldQty.set(it.productId, (soldQty.get(it.productId) ?? 0) + it.qty);
      // FEFO allocation across batches for tracked products
      const list = batchesByProduct.get(it.productId);
      let left = it.qty;
      if (list?.length) {
        for (const b of [...list].sort((a, b) => (a.expiry?.getTime() ?? Infinity) - (b.expiry?.getTime() ?? Infinity))) {
          if (left <= 0) break;
          const take = Math.min(b.remaining, left);
          if (take > 0) {
            b.remaining -= take;
            left -= take;
            await db.productBatch.update({ where: { id: b.id }, data: { quantity: m3(b.remaining) } });
            if (b.remaining <= 0) b.expiry = null;
          }
        }
      }
      await db.inventoryMovement.create({
        data: {
          productId: it.productId, type: "SALE", quantity: m3(-it.qty),
          unitCost: m2(it.cost), refType: "Sale", refId: sale.id,
          userId: draft.cashierId, createdAt: draft.date,
        },
      });
    }

    if (draft.customerId) {
      const agg = customerAgg.get(draft.customerId) ?? { total: 0, balanceDelta: 0, points: 0 };
      agg.total += subtotal;
      agg.balanceDelta += creditAmount;
      agg.points += pointsEarned;
      customerAgg.set(draft.customerId, agg);
      const runningPoints = (pointsBalance.get(draft.customerId) ?? 0) + pointsEarned;
      pointsBalance.set(draft.customerId, runningPoints);
      await db.loyaltyTransaction.create({
        data: {
          customerId: draft.customerId, type: "EARN", points: m2(pointsEarned),
          balanceAfter: m2(runningPoints),
          refType: "Sale", refId: sale.id, createdAt: draft.date,
        },
      });
    }
  }

  // Apply customer aggregates
  for (const [customerId, agg] of customerAgg) {
    await db.customer.update({
      where: { id: customerId },
      data: {
        totalPurchases: m2(agg.total), balance: m2(agg.balanceDelta),
        loyaltyPoints: { increment: agg.points }, lastPurchaseAt: new Date(),
      },
    });
  }

  // ── Final inventory state + low/out-of-stock scenarios ───────────────────
  console.log("→ setting inventory levels…");
  for (const { id, def } of products) {
    const purchased = purchasedQty.get(id) ?? 0;
    const sold = soldQty.get(id) ?? 0;
    let final = Math.max(purchased - sold, 0);
    // Force demo scenarios: two out-of-stock, few low-stock
    if (def.sku === "WTR-15" || def.sku === "EGG-30") final = 0;
    if (def.sku === "MLK-1L") final = 3;
    if (def.sku === "RIC-10") final = 2;
    const minStock = parseFloat(def.minStock ? String(def.minStock) : "") || int(6, 20);
    await db.inventory.create({
      data: {
        productId: id, quantity: m3(final),
        lastCost: m2(def.cost), avgCost: m2(def.cost),
        reserved: "0",
      },
    });
    void minStock;
  }
  // Low-stock signals relative to product thresholds:
  await db.product.update({ where: { sku: "MLK-1L" }, data: { minStock: "10", reorderLevel: "15" } });
  await db.product.update({ where: { sku: "RIC-10" }, data: { minStock: "8", reorderLevel: "12" } });
  await db.product.update({ where: { sku: "COLA-33" }, data: { minStock: "24", reorderLevel: "48" } });
  await db.product.update({ where: { sku: "TEA-450" }, data: { minStock: "15", reorderLevel: "25" } });

  // ── Sample returns ───────────────────────────────────────────────────────
  console.log("→ seeding sample returns…");
  const sampleSale = await db.sale.findFirstOrThrow({
    where: { status: "COMPLETED" },
    orderBy: { saleDate: "desc" },
    include: { items: true, cashier: true },
  });
  const returnItem = sampleSale.items[0];
  const retQty = 1;
  const retLine = retQty * parseFloat(String(returnItem.unitPrice));
  const saleReturn = await db.saleReturn.create({
    data: {
      returnNumber: "SRN-000001", saleId: sampleSale.id, userId: adminUser.id,
      subtotal: m2(retLine), total: m2(retLine), costTotal: m2(retQty * parseFloat(String(returnItem.costPrice))),
      reason: "Damaged packaging", restock: true,
      refundAmount: m2(retLine),
      items: {
        create: {
          saleItemId: returnItem.id, productId: returnItem.productId,
          quantity: m3(retQty), unitPrice: returnItem.unitPrice,
          costPrice: returnItem.costPrice, lineTotal: m2(retLine),
        },
      },
    },
  });
  await db.sale.update({
    where: { id: sampleSale.id },
    data: { status: "PARTIALLY_REFUNDED", refundedAmount: m2(retLine) },
  });
  await db.inventoryMovement.create({
    data: {
      productId: returnItem.productId, type: "SALE_RETURN", quantity: m3(retQty),
      unitCost: returnItem.costPrice, refType: "SaleReturn", refId: saleReturn.id,
      userId: adminUser.id,
    },
  });
  await db.inventory.upsert({
    where: { productId: returnItem.productId },
    create: { productId: returnItem.productId, quantity: m3(retQty) },
    update: { quantity: { increment: retQty } },
  });

  // ── Expenses ─────────────────────────────────────────────────────────────
  console.log("→ seeding expenses…");
  const expenseCatIds: Record<string, string> = {};
  for (const [name, nameAr] of [
    ["Rent", "إيجار"], ["Electricity", "كهرباء"], ["Water", "ماء"], ["Internet", "إنترنت"],
    ["Salaries", "رواتب"], ["Transportation", "مواصلات"], ["Maintenance", "صيانة"], ["Other", "أخرى"],
  ] as const) {
    const ec = await db.expenseCategory.create({ data: { name, nameAr } });
    expenseCatIds[name] = ec.id;
  }
  const expenseAmounts: Record<string, number> = {
    Rent: 150000, Electricity: 45000, Water: 12000, Internet: 15000, Salaries: 480000, Transportation: 30000, Maintenance: 25000, Other: 18000,
  };
  let expSeq = 0;
  for (let monthOffset = 3; monthOffset >= 0; monthOffset--) {
    for (const [catName, base] of Object.entries(expenseAmounts)) {
      expSeq++;
      const amount = Math.round(base * (0.85 + rand() * 0.3));
      await db.expense.create({
        data: {
          expenseNumber: `EXP-${pad(expSeq, 5)}`,
          categoryId: expenseCatIds[catName], amount: m2(amount),
          method: catName === "Salaries" ? "BANK_TRANSFER" : "CASH",
          description: `${catName} payment`, expenseDate: daysAgo(monthOffset * 30 + int(1, 20)),
          userId: adminUser.id,
        },
      });
    }
  }

  // ── Notifications ────────────────────────────────────────────────────────
  await db.notification.createMany({
    data: [
      { type: "OUT_OF_STOCK", title: "Water 1.5L is out of stock", body: "Product has reached zero quantity." },
      { type: "LOW_STOCK", title: "Milk 1L is below minimum stock", body: "Current: 3, Minimum: 10." },
      { type: "EXPIRING", title: "Batches expiring within 30 days", body: "Review expiring inventory page." },
      { type: "SYSTEM", title: "Welcome to Al-Rahma Grocery ERP", body: "Seed completed successfully." },
    ],
  });

  // Summary
  const counts = {
    users: await db.user.count(), roles: await db.role.count(), permissions: await db.permission.count(),
    categories: await db.category.count(), brands: await db.brand.count(), units: await db.unit.count(),
    products: await db.product.count(), suppliers: await db.supplier.count(), customers: await db.customer.count(),
    purchases: await db.purchase.count(), sales: await db.sale.count(), returns: await db.saleReturn.count(),
    expenses: await db.expense.count(), movements: await db.inventoryMovement.count(), batches: await db.productBatch.count(),
  };
  console.log("✓ Seed complete:", JSON.stringify(counts));
}

async function wipe() {
  for (const t of [
    db.notification.deleteMany(), db.backupRecord.deleteMany(), db.auditLog.deleteMany(),
    db.loyaltyTransaction.deleteMany(), db.customerTransaction.deleteMany(),
    db.saleReturnItem.deleteMany(), db.saleReturn.deleteMany(), db.salePayment.deleteMany(),
    db.saleItem.deleteMany(), db.sale.deleteMany(),
    db.purchaseReturnItem.deleteMany(), db.purchaseReturn.deleteMany(),
    db.purchaseItem.deleteMany(), db.purchase.deleteMany(),
    db.purchaseOrderItem.deleteMany(), db.purchaseOrder.deleteMany(),
    db.stockAdjustment.deleteMany(), db.inventoryMovement.deleteMany(),
    db.productBatch.deleteMany(), db.inventory.deleteMany(),
    db.productBarcode.deleteMany(), db.product.deleteMany(),
    db.category.deleteMany(), db.brand.deleteMany(),
    db.unitConversion.deleteMany(), db.unit.deleteMany(),
    db.expense.deleteMany(), db.expenseCategory.deleteMany(),
    db.customer.deleteMany(), db.customerGroup.deleteMany(), db.supplier.deleteMany(),
    db.session.deleteMany(), db.loginActivity.deleteMany(), db.passwordResetToken.deleteMany(),
    db.rolePermission.deleteMany(), db.user.deleteMany(), db.role.deleteMany(), db.permission.deleteMany(),
    db.storeSettings.deleteMany(), db.systemSettings.deleteMany(),
  ]) {
    await t;
  }
}

main()
  .then(async () => { await db.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error(err); await db.$disconnect(); process.exit(1); });
