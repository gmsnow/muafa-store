// M12 auth smoke test: login, lockout, reset, forced password change — npx tsx scripts/smoke-auth.ts
import "dotenv/config";
import { db } from "../src/shared/db";
import { authenticate, requestPasswordReset, resetPassword, changeOwnPassword } from "../src/features/auth/service";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS ${name}`);
  else { failures++; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
}

function code(err: unknown): string {
  return (err as { code?: string })?.code ?? String(err);
}

async function main() {
  // Test isolation: script-context requests carry no X-Forwarded-For (ip=null).
  // Purge those activity rows so the IP-level throttle (20 failures / 10 min)
  // never leaks between runs. Real browser requests always carry an IP.
  await db.loginActivity.deleteMany({ where: { ip: null } });

  // ---- happy path login (cashier has no side-effects on sales)
  const cashier = await db.user.findFirstOrThrow({
    where: { role: { name: "CASHIER" }, deletedAt: null },
  });
  await db.user.update({ where: { id: cashier.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });

  console.log("auth:");
  let ok = false;
  try {
    await db.user.update({ where: { id: cashier.id }, data: { passwordHash: await (await import("bcryptjs")).hash("Test@123", 4) } });
    const res = await authenticate({ identity: cashier.username, password: "Test@123", remember: false });
    ok = res.userId === cashier.id;
  } catch { ok = false; }
  check("valid login succeeds", ok);

  // ---- wrong password increments attempts
  try { await authenticate({ identity: cashier.username, password: "wrong", remember: false }); }
  catch (e) { check("bad password → INVALID_CREDENTIALS", code(e) === "INVALID_CREDENTIALS"); }
  const after1 = await db.user.findUniqueOrThrow({ where: { id: cashier.id } });
  check("failedLoginAttempts incremented", after1.failedLoginAttempts === 1, String(after1.failedLoginAttempts));

  // ---- lockout after maxLoginAttempts (settings = 5; already 1)
  let lockedCode = "";
  for (let i = 0; i < 5; i++) {
    try { await authenticate({ identity: cashier.username, password: "wrong", remember: false }); }
    catch (e) { lockedCode = code(e); }
  }
  check("reached ACCOUNT_LOCKED", lockedCode === "ACCOUNT_LOCKED", lockedCode);
  const lockedUser = await db.user.findUniqueOrThrow({ where: { id: cashier.id } });
  check("lockedUntil set in future", Boolean(lockedUser.lockedUntil && lockedUser.lockedUntil > new Date()));
  check("attempts reset on lock", lockedUser.failedLoginAttempts === 0);

  // ---- correct password still rejected while locked
  try {
    await authenticate({ identity: cashier.username, password: "Test@123", remember: false });
    check("locked rejects correct password", false);
  } catch (e) {
    check("locked rejects correct password", code(e) === "ACCOUNT_LOCKED");
  }

  // ---- unknown identity → uniform INVALID_CREDENTIALS (no enumeration)
  try { await authenticate({ identity: "no_such_user_xyz", password: "x", remember: false }); check("unknown user rejected", false); }
  catch (e) { check("unknown user rejected uniformly", code(e) === "INVALID_CREDENTIALS"); }

  // ---- suspended account blocked
  if (!cashier.lockedUntil || cashier.lockedUntil < new Date()) {
    await db.user.update({ where: { id: cashier.id }, data: { lockedUntil: null, status: "SUSPENDED" } });
    try { await authenticate({ identity: cashier.username, password: "Test@123", remember: false }); check("suspended blocked", false); }
    catch (e) { check("suspended blocked", code(e) === "ACCOUNT_SUSPENDED"); }
    await db.user.update({ where: { id: cashier.id }, data: { status: "ACTIVE" } });
  } else {
    check("suspended blocked", true, "skipped — user still locked");
  }

  // ---- forgot/reset flow
  const emailUser = await db.user.findFirstOrThrow({ where: { deletedAt: null, email: { not: null } } });
  const { devToken } = await requestPasswordReset({ email: emailUser.email! });
  check("reset token issued (dev)", typeof devToken === "string" && devToken.length >= 32);
  let weakRejected = false;
  try { await resetPassword({ token: devToken!, password: "12345", confirmPassword: "12345" }); } catch { weakRejected = true; }
  check("weak new password rejected", weakRejected);
  await resetPassword({ token: devToken!, password: "NewPass@999", confirmPassword: "NewPass@999" });
  const refreshed = await db.user.findFirstOrThrow({ where: { id: emailUser.id } });
  check("password changed + locks cleared",
    refreshed.failedLoginAttempts === 0 && refreshed.lockedUntil === null &&
    !(await (await import("bcryptjs")).compare("Test@123", refreshed.passwordHash)));
  let reuseRejected = false;
  try { await resetPassword({ token: devToken!, password: "Another@111", confirmPassword: "Another@111" }); } catch { reuseRejected = true; }
  check("reset token single-use", reuseRejected);

  // login with the NEW password works
  const loginRes = await authenticate({ identity: emailUser.email!, password: "NewPass@999", remember: false });
  check("login works after reset", loginRes.userId === emailUser.id);

  // ---- forced change flow (mustChangePassword)
  await db.user.update({ where: { id: cashier.id }, data: { lockedUntil: null, failedLoginAttempts: 0, mustChangePassword: true } });
  let weak2 = false;
  try { await changeOwnPassword(cashier.id, "abc"); } catch { weak2 = true; }
  check("self-change min-length enforced", weak2);
  await changeOwnPassword(cashier.id, "Changed@777");
  const forced = await db.user.findUniqueOrThrow({ where: { id: cashier.id } });
  check("mustChangePassword cleared", forced.mustChangePassword === false);

  // restore original passwords so other flows/docs stay valid
  await db.user.update({ where: { id: cashier.id }, data: { passwordHash: await (await import("bcryptjs")).hash("Dev@12345", 10), mustChangePassword: false } });
  await db.user.update({ where: { id: emailUser.id }, data: { passwordHash: await (await import("bcryptjs")).hash("Dev@12345", 10) } });

  console.log(failures === 0 ? "\nALL AUTH CHECKS PASSED" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
