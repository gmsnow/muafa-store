// §49 critical-path test matrix runner: npx tsx scripts/test-all.ts
// Executes every smoke suite in sequence against the live dev database and prints a summary.
import { spawnSync } from "child_process";

const SUITES: { name: string; file: string; covers: string }[] = [
  { name: "Auth & sessions", file: "scripts/smoke-auth.ts", covers: "§49 auth matrix: login, lockout, reset, forced change" },
  { name: "Sales core", file: "scripts/smoke.ts", covers: "F2 checkout, F3 returns, cancel reversal, credit sale" },
  { name: "Procurement", file: "scripts/smoke-procurement.ts", covers: "F4 receiving/batches, F5 returns, PO machine" },
  { name: "Customers", file: "scripts/smoke-customers.ts", covers: "credit/ledger invariants, loyalty, soft-delete guards" },
  { name: "Reports", file: "scripts/smoke-reports.ts", covers: "8 report families + financial summary vs raw SQL" },
  { name: "Expenses/Notif/Search", file: "scripts/smoke-m9.ts", covers: "expense rules, notification dedupe, global search" },
  { name: "Settings/Users/Roles/Backups", file: "scripts/smoke-m10.ts", covers: "settings persist+affect behavior, RBAC admin, pg_dump" },
];

let failed = 0;
const results: string[] = [];
console.log(`\n== Grocery ERP — §49 test matrix (${SUITES.length} suites) ==\n`);
for (const s of SUITES) {
  process.stdout.write(`▶ ${s.name} (${s.file})\n`);
  const r = spawnSync("npx", ["tsx", s.file], {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  });
  const out = Buffer.concat([r.stdout ?? Buffer.alloc(0), r.stderr ?? Buffer.alloc(0)]).toString("utf8");
  const passCount = (out.match(/PASS /g) ?? []).length;
  const failCount = (out.match(/FAIL /g) ?? []).length;
  const ok = r.status === 0 && failCount === 0;
  if (!ok) {
    failed++;
    console.log(out.split("\n").filter((l) => l.includes("FAIL")).join("\n"));
    console.log(out.slice(-1200));
  }
  results.push(`${ok ? "✓" : "✗"} ${s.name.padEnd(28)} ${String(passCount).padStart(2)} checks — ${s.covers}`);
}
console.log("\n== Summary ==");
for (const r of results) console.log("  " + r);
console.log(failed === 0 ? "\nALL SUITES GREEN" : `\n${failed} SUITE(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
