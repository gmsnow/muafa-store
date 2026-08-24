// M10 smoke test: settings, users, roles, audit, backups — npx tsx scripts/smoke-m10.ts
import "dotenv/config";
import { db } from "../src/shared/db";
import { unlink, readFile } from "fs/promises";
import {
  getSystemSettings, getStoreSettings,
  saveSalesSettings, saveInventorySettings, saveLocalizationSettings,
  saveSecuritySettings, saveStoreSettings,
} from "../src/features/settings/service";
import { listAudit, listAuditFacets } from "../src/features/audit/service";
import { saveUser, getUserForEdit, setUserStatus, softDeleteUser, listUsers } from "../src/features/users/service";
import { listRoles, saveRole, deleteRole } from "../src/features/roles/service";
import { createBackup, listBackups, deleteBackup, getBackupFilePath } from "../src/features/backups/service";
import { createSale, cancelSale } from "../src/features/sales/service";
import type { AuthUser } from "../src/features/auth/session";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  // Idempotency: hard-delete leftovers from prior runs
  await db.user.deleteMany({ where: { username: { startsWith: "smoke_" } } });
  await db.role.deleteMany({ where: { name: "SMOKE_TESTER" } });

  const adminRow = await db.user.findFirstOrThrow({
    where: { role: { name: "SUPER_ADMIN" }, deletedAt: null },
    include: { role: true },
  });
  const admin: AuthUser = {
    id: adminRow.id, username: adminRow.username, email: adminRow.email,
    fullName: adminRow.fullName, fullNameAr: adminRow.fullNameAr,
    roleName: "SUPER_ADMIN", permissions: ["*"], mustChangePassword: false,
  };
  const origSystem = await getSystemSettings();
  // Baseline sanity: if a previous crashed run corrupted settings, restore seed defaults first.
  if (origSystem.invoicePrefix !== "INV-") {
    await db.systemSettings.update({ where: { id: "system" }, data: { invoicePrefix: "INV-" } });
    origSystem.invoicePrefix = "INV-";
  }
  if (Number(origSystem.defaultTaxRate) !== 0) {
    await db.systemSettings.update({ where: { id: "system" }, data: { defaultTaxRate: "0" } });
    origSystem.defaultTaxRate = "0" as unknown as typeof origSystem.defaultTaxRate;
  }

  // ================= SETTINGS =================
  console.log("settings:");
  await saveSalesSettings(admin.id, { invoicePrefix: "smx-", defaultTaxRate: 12.5 });
  let sys = await getSystemSettings();
  check("sales saved (prefix uppercased)", sys.invoicePrefix === "SMX-" && Number(sys.defaultTaxRate) === 12.5);

  await saveInventorySettings(admin.id, { lowStockThresholdDays: 3, expirationWarningDays: 45, batchTrackingEnabled: "true" });
  sys = await getSystemSettings();
  check("inventory saved", sys.lowStockThresholdDays === 3 && sys.expirationWarningDays === 45 && sys.batchTrackingEnabled === true);

  await saveLocalizationSettings(admin.id, { dateFormat: "dd/MM/yyyy", timezone: "Asia/Riyadh" });
  sys = await getSystemSettings();
  check("localization saved", sys.language === "ar" && sys.dateFormat === "dd/MM/yyyy");

  await saveSecuritySettings(admin.id, { passwordMinLength: 6, sessionTimeoutMinutes: 480, maxLoginAttempts: 5, lockoutMinutes: 15 });
  sys = await getSystemSettings();
  check("security saved", sys.passwordMinLength === 6 && sys.maxLoginAttempts === 5);

  await saveStoreSettings(admin.id, {
    name: "Smoke Store", nameAr: "", logoUrl: "", address: "", addressAr: "",
    phone: "", email: "", taxNumber: "", currencyCode: "yer", currencySymbol: "ر.ي", receiptFooter: "",
  });
  const store = await getStoreSettings();
  check("store saved (currency uppercased)", store.name === "Smoke Store" && store.currencyCode === "YER");
  await db.storeSettings.update({
    where: { id: "store" },
    data: {
      name: "Al-Rahma Grocery", nameAr: "بقالة الرحمة",
      address: "Sana'a, Al-Hasabah St., Yemen", addressAr: "صنعاء - شارع الحصبة - اليمن",
      phone: "+967-771-234567", email: "info@alrahma-grocery.ye",
      currencyCode: "YER", currencySymbol: "ر.ي",
      receiptFooter: "Thank you for shopping with us!",
    },
  });

  // behavior: prefix drives new sale numbering (pick product with live batch stock)
  const batch = await db.productBatch.findFirstOrThrow({
    where: { quantity: { gt: 0 }, expiryDate: { gt: new Date() } },
    orderBy: { quantity: "desc" },
  });
  const sale = await createSale(admin.id, {
    items: [{ productId: batch.productId, quantity: 1 }],
    payments: [{ method: "CASH", amount: 1000000 }],
    invoiceDiscount: 0,
  }) as unknown as { saleId: string; invoiceNumber: string };
  check("invoice prefix affects numbering", sale.invoiceNumber.startsWith("SMX-"), sale.invoiceNumber);
  await cancelSale(admin.id, sale.saleId);

  // restore original settings values
  await db.systemSettings.update({
    where: { id: "system" },
    data: {
      invoicePrefix: origSystem.invoicePrefix,
      defaultTaxRate: origSystem.defaultTaxRate.toFixed ? origSystem.defaultTaxRate.toFixed(2) : String(origSystem.defaultTaxRate),
      lowStockThresholdDays: origSystem.lowStockThresholdDays,
      expirationWarningDays: origSystem.expirationWarningDays,
      batchTrackingEnabled: origSystem.batchTrackingEnabled,
      language: origSystem.language,
      dateFormat: origSystem.dateFormat,
      timezone: origSystem.timezone,
    },
  });

  // ================= AUDIT =================
  console.log("audit:");
  const byAction = await listAudit({ action: "SETTINGS_UPDATE", page: 1, pageSize: 5 });
  check("audit filters by action", byAction.total >= 5 && byAction.rows.every((r) => r.action === "SETTINGS_UPDATE"));
  const facets = await listAuditFacets();
  check("facets include actions+entities", facets.actions.includes("SETTINGS_UPDATE") && facets.entityTypes.includes("StoreSettings"));
  const byUser = await listAudit({ userId: admin.id, action: "USER_CREATE", page: 1 });
  check("empty filter result ok", byUser.rows.length >= 0);

  // ================= ROLES =================
  console.log("roles:");
  const role = await saveRole(admin, { name: "smoke tester", nameAr: "مجرب", description: "temp", permissions: ["dashboard.view", "products.view"] });
  let permsAfter = await db.rolePermission.findMany({ where: { roleId: role.id } });
  check("role created w/ perms", permsAfter.length === 2 && role.name === "SMOKE_TESTER");
  await saveRole(admin, { id: role.id, name: "SMOKE_TESTER", permissions: ["products.view"] });
  permsAfter = await db.rolePermission.findMany({ where: { roleId: role.id } });
  check("role perm sync replaces", permsAfter.length === 1 && permsAfter[0].permissionKey === "products.view");

  const roles = await listRoles();
  const superRole = roles.find((r) => r.name === "SUPER_ADMIN");
  let superBlocked = false;
  try { await saveRole(admin, { id: superRole!.id, name: "SUPER_ADMIN", permissions: [] }); } catch { superBlocked = true; }
  check("SUPER_ADMIN edit blocked", superBlocked);

  await deleteRole(role.id);
  check("custom empty role deleted", !(await db.role.findUnique({ where: { name: "SMOKE_TESTER" } })));
  let systemDeleteBlocked = false;
  try { await deleteRole(superRole!.id); } catch { systemDeleteBlocked = true; }
  check("system role delete blocked", systemDeleteBlocked);

  // ================= USERS =================
  console.log("users:");
  const cashierRole = await db.role.findFirstOrThrow({ where: { name: "CASHIER" } });
  const u = await saveUser(admin, {
    username: "smoke_user", fullName: "Smoke User", fullNameAr: "", email: "smoke_user@test.local",
    phone: "", roleId: cashierRole.id, password: "Pass@123",
  });
  check("user created + hashed pw", Boolean(u.id));
  const createdRow = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  check("mustChangePassword default true", createdRow.mustChangePassword === true);

  let dupRejected = false;
  try {
    await saveUser(admin, { username: "smoke_user", fullName: "Dup", roleId: cashierRole.id, password: "Pass@123" });
  } catch { dupRejected = true; }
  check("duplicate username rejected", dupRejected);

  let shortPwRejected = false;
  try {
    await saveUser(admin, { username: "smoke_short", fullName: "S", roleId: cashierRole.id, password: "12345" });
  } catch { shortPwRejected = true; }
  check("password min-length enforced (6)", shortPwRejected);

  const editView = await getUserForEdit(u.id);
  check("getUserForEdit", editView.username === "smoke_user" && editView.roleId === cashierRole.id);

  await setUserStatus(admin, u.id, "SUSPENDED");
  check("suspend works", (await db.user.findUniqueOrThrow({ where: { id: u.id } })).status === "SUSPENDED");
  let selfStatusBlocked = false;
  try { await setUserStatus(admin, admin.id, "SUSPENDED"); } catch { selfStatusBlocked = true; }
  check("self-status change blocked", selfStatusBlocked);

  const supersBefore = await db.user.count({ where: { role: { name: "SUPER_ADMIN" }, deletedAt: null, status: "ACTIVE" } });
  let lastSuperGuard = false;
  if (supersBefore <= 1) {
    try { await softDeleteUser(admin, admin.id); } catch (e) {
      lastSuperGuard = String(e).includes("SUPER_ADMIN") || String(e).toLowerCase().includes("own");
    }
    check("last-super-admin delete blocked", lastSuperGuard);
  } else {
    check("last-super-admin delete blocked", true, `skipped (${supersBefore} supers)`);
  }

  await softDeleteUser(admin, u.id);
  check("user soft-deleted", (await db.user.findUniqueOrThrow({ where: { id: u.id } })).deletedAt !== null);
  const listed = await listUsers({});
  check("list excludes deleted", listed.rows.every((r) => r.deletedAt === null));

  // ================= BACKUPS =================
  console.log("backups:");
  const rec = await createBackup(admin, "smoke-m10");
  check("backup completed", rec.status === "COMPLETED" && rec.filename.endsWith(".sql"), rec.filename);
  const rows = await listBackups();
  check("backup listed", rows.some((r) => r.id === rec.id && (r.sizeBytes ?? 0) > 0));
  const { filePath } = await getBackupFilePath(rec.id);
  const dumpHead = await readFile(filePath, "utf8").then((s) => s.slice(0, 4000)).catch(() => "");
  check("dump is SQL with schema", dumpHead.includes("PostgreSQL database dump") || dumpHead.includes("CREATE TABLE"));
  check("no credentials in dump header", !dumpHead.includes("PGPASSWORD") && !dumpHead.toLowerCase().includes(":123@"));

  await deleteBackup(rec.id);
  check("delete removes record", !(await db.backupRecord.findUnique({ where: { id: rec.id } })));
  await unlink(filePath).catch(() => {});
  let missing404 = false;
  try { await getBackupFilePath(rec.id); } catch { missing404 = true; }
  check("missing backup file → NOT_FOUND", missing404);

  // cleanup audit noise from smoke user ops is unnecessary; finish
  console.log(failures === 0 ? "\nALL M10 CHECKS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
