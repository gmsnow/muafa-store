# PROJECT_MAP.md — Grocery Management System

> Last synced: 2026-08-24 | Status: **COMPLETE — M0–M12 all implemented + runtime-verified (§49 matrix runner `npx tsx scripts/test-all.ts`: 154 checks across 7 suites ALL GREEN; tsc clean; build ✓; 13 routes 200 authed)**

---

## [ENVIRONMENT FACTS] (verified 2026-08-23)

| Item | Value |
|---|---|
| OS / Shell | Windows, PowerShell 5.1 |
| Node / npm | v22.18.0 LTS / 10.9.3 |
| Working dir | `H:\hitham\new project\grocery` (empty, greenfield) |
| PostgreSQL | 16.3 installed, service `postgresql-x64-16` RUNNING |
| pgAdmin | Available via PostgreSQL installation tree |

## [TECH_STACK] (locked to latest stable on npm @ 2026-08-23)

| Layer | Package | Version | Notes |
|---|---|---|---|
| Framework | next | 16.3.2 | App Router, RSC-first |
| UI runtime | react / react-dom | 19.2.8 | |
| Language | typescript | 7.0.2 (latest) | **Gate:** must pass with eslint+next lint; fallback pin `^5.9` if typescript-eslint conflicts (decided at M0) |
| Styling | tailwindcss | 4.3.3 | CSS-first config, RTL via logical properties (`ms-*`,`me-*`,`ps-*`,`pe-*`) |
| Components | shadcn/ui (CLI) + class-variance-authority 0.7.1 + tailwind-merge 3.6.0 | latest | Radix primitives underneath |
| Icons | lucide-react | 1.33.0 | |
| Forms | react-hook-form 7.86.0 + @hookform/resolvers 5.9.1 | latest | Client validation UX |
| Validation | zod | 4.4.3 | Shared client+server schemas |
| ORM | prisma / @prisma/client | 7.9.1 | Prisma 7 config style (`prisma.config.ts`); numeric() money columns |
| DB | PostgreSQL | 16.3 | Managed/inspected via pgAdmin. SQLite forbidden. |
| Auth | **Custom session layer**: `jose` 6.2.10 (JWT, httpOnly cookie) + bcryptjs 3.0.3 | — | Rationale: next-auth latest stable = v4 (pre-Next-16 era), v5 still beta. Spec allows "another production-quality solution". Full control over sessions, login-activity, account status, RBAC. **Pending approval.** |
| Charts | recharts | 3.10.1 | Lazy-loaded, dynamic import |
| Tables | @tanstack/react-table | 9.1.2 | Server-side pagination/sort/filter |
| Excel export | exceljs | 4.4.0 | CSV via native streaming |
| Money math | decimal.js | latest | Never float. DB stores `numeric(14,2)` |
| Testing | vitest (+ integration tests against real PG test database) | latest | Critical-path tests per §49 |

Dev tooling: ESLint (flat config, next preset), Prettier, `.env.example`, git init at M0.

### Deprecated / rejected choices (documented)
- ❌ next-auth v4 (not built/tested against Next 16) and v5-beta (non-stable)
- ❌ Lucia (archived), SQLite (forbidden by spec)
- ❌ JavaScript floats for money (spec §47)

## [SYSTEM_FLOW]

### F1 — Auth
login(email/password) → bcrypt verify → account status check (ACTIVE/SUSPENDED/LOCKED) → issue JWT (`jose`) in httpOnly+secure+sameSite=lax cookie (sliding expiry, remember-me extends) → upsert `Session` row (revocation source of truth) → log `LOGIN` in AuditLog + LoginActivity (IP, UA) → redirect `/dashboard`.
Failure path: increment failed attempts → rate-limit lockout (per-account + per-IP) → generic error (no user enumeration).
middleware.ts: unauthenticated → `/login`; authenticated hitting `/login` → `/dashboard`; route-group layout enforces permission map server-side.

### F2 — Sale (POS checkout) — single Prisma `$transaction` (Serializable):
1. Validate items server-side (zod): prices re-fetched from DB, never trusted from client
2. Lock product inventory rows (`SELECT ... FOR UPDATE` semantics via Prisma raw within txn) → prevent race/negative stock
3. Create `Sale` (number auto-seq, prefix from settings) + `SaleItem[]` (snapshot costPrice for accurate COGS/profit forever)
4. Batch deduction FEFO (First-Expired-First-Out) for batch-tracked products
5. Create `InventoryMovement` per item (type=SALE, qty negative)
6. Create `SalePayment[]` (supports split methods; CREDIT validates customer credit limit inside txn)
7. Loyalty accrual (if enabled) → `LoyaltyTransaction`
8. Customer balance update (credit case)
9. AuditLog entry
Any failure ⇒ full rollback, structured error to client.

### F3 — Sale Return: authorized perm `sales.refund` → original invoice lookup → items/qty validation (never exceed sold − already returned) → reverse movements (+qty, FEFO-irrelevant: restock batch or new ADJUSTMENT batch) → refund payment record → customer balance reversal → audit. Atomic txn.

### F4 — Purchasing: PO lifecycle draft→pending→approved→ordered→partially_received→received/cancelled. Receiving: txn creates `Purchase`+`PurchaseItem[]` (cost snapshot), increments stock, creates batches (mfg/exp dates), movements type=PURCHASE, supplier balance += total, audit. Partial receipts tracked per PO line.

### F5 — Purchase Return: mirror of F4 decrementing stock + supplier balance, movement type=PURCHASE_RETURN.

### F6 — Stock Adjustment: manual increase/decrease with mandatory reason → `StockAdjustment` + `InventoryMovement` + audit, one txn. Direct stock writes outside movement creation are architecturally impossible (all writes go through `inventory.service`).

### F7 — Reporting data flow: RSC page → service layer → aggregate SQL (Prisma `aggregate`/`groupBy`/raw views) → server-rendered tables + charts. All lists paginated server-side (default 25/page).

### Financial formulas (authoritative, implemented in `shared/core/money.ts` + report services)
- Net Sales = Σ(invoice grand totals incl. tax, post-discount) − Sales Returns
- COGS = Σ(saleItem.qty × item.costSnapshot) − Returns(at their cost snapshot)
- **Gross Profit = Net Sales(excl. tax) − COGS**
- Expenses (operating) → Net Profit = Gross Profit − Expenses
- Inventory Value = Σ(stock.qty × last purchase cost)

## [ARCHITECTURE]

Domain-first (feature modules), no micro-files. Server Actions for mutations + Route Handlers only where REST semantics matter (public-shaped APIs, exports).

```
grocery/
├─ prisma/                      # schema.prisma, migrations/, seed.ts
├─ src/
│  ├─ app/
│  │  ├─ (auth)/                # login | forgot-password | reset-password
│  │  ├─ (app)/                 # sidebar shell layout; ALL business routes
│  │  │  ├─ dashboard/
│  │  │  ├─ inventory/{products,categories,brands,units,stock,adjustments,low-stock,expiring,movements}
│  │  │  ├─ sales/{pos,orders,returns,invoices,[id]}
│  │  │  ├─ procurement/{suppliers,purchase-orders,purchases,returns}
│  │  │  ├─ customers/{list,groups,transactions,loyalty}
│  │  │  ├─ reports/{sales,purchases,profit,inventory,customers,suppliers,tax,expenses}
│  │  │  ├─ expenses/
│  │  │  ├─ users/ roles/ audit-log/
│  │  │  └─ settings/{store,sales,inventory,localization,security,backup,system}
│  │  └─ api/                   # route handlers: products, sales, reports, export...
│  ├─ features/<domain>/        # schema.ts(zod) · service.ts(business logic) · actions.ts(server actions) · ui.tsx(co-located components) — max cohesion, no fragmentation
│  ├─ shared/
│  │  ├─ db.ts                  # Prisma singleton
│  │  ├─ auth/                  # session.ts(jose) · rbac.ts(permission matrix) · guard.ts(requirePermission)
│  │  └─ core/                  # money.ts · api-response.ts · logger.ts(async, levels, no PII/secrets) · audit.ts · csv.ts · notify.ts
│  ├─ components/ui/            # shadcn + reusable DataTable, FormFields, ConfirmDialog, EmptyState, ErrorState, Skeletons, StatCard
│  └─ middleware.ts             # session check + route protection
├─ tests/                       # vitest unit + integration (real PG)
├─ .env.example  README.md  PROJECT_MAP.md
```

### RBAC model
Roles × granular permissions (§3 list) stored in `RolePermission`; enforced by `guard.requirePermission('products.create')` inside **every** server action/route handler (server-side truth, not UI hiding). Seeded roles: SUPER_ADMIN, ADMINISTRATOR, MANAGER, CASHIER, INVENTORY_MANAGER, ACCOUNTANT.

## [DATA_MODEL] (~35 models, UUID PKs, createdAt/updatedAt, FKs, unique + perf indexes)

Groups:
1. **Identity/RBAC**: User, Role, Permission, RolePermission, Session, LoginActivity
2. **Catalog**: Category(self-FK nested), Brand, Unit(+UnitConversion), Product, ProductBarcode, ProductBatch
3. **Stock**: Inventory(unique productId), InventoryMovement(indexed type/date/productId), StockAdjustment
4. **Sales**: CustomerGroup, Customer, CustomerTransaction, LoyaltyTransaction, Sale, SaleItem(cost snapshot), SalePayment, SaleReturn, SaleReturnItem
5. **Procurement**: Supplier, PurchaseOrder, PurchaseOrderItem, Purchase, PurchaseItem, PurchaseReturn, PurchaseReturnItem
6. **Finance/Ops**: ExpenseCategory, Expense
7. **System**: AuditLog(indexed userId/action/date), StoreSettings, SystemSettings, BackupRecord, Notification

Key indexes: product(barcode, sku, nameAr/name trigram-ish ILIKE), sale(invoiceNo unique, createdAt, cashierId, status), purchase(poNumber), customer(phone), movement(productId,createdAt), batch(expiresAt). Money columns: `Decimal @db.Decimal(14,2)`.

Soft delete: Product, Customer, Supplier, User (deletedAt flag; financial records immutable — corrections via compensating documents only).

## [MILESTONES] (verifiable goals — each ends with build+lint+migration+manual verification)

| ID | Scope | Success criterion (verifiable) |
|---|---|---|
| M0 | Scaffold, toolchain, DB create, CI-quality gates | `npm run build` ✅ zero errors; ESLint+Prettier configured; `prisma migrate dev` creates schema in PG; `.env.example` committed; TS7-vs-5 gate decided |
| M1 | Full data model + seed | All ~35 models migrate; seed loads realistic dataset (users×6 roles, 40+ grocery products, categories tree, brands, units+conversions, suppliers, customers, purchases, 60+ sales across dates, batches incl. expired/expiring, expenses); counts verified via SQL |
| M2 | Auth + RBAC + middleware | Login/logout/session-expiry/account-status/rate-limit work; forgot/reset-password flow completes; integration test proves unauthorized API call ⇒ 403 and anonymous ⇒ redirect |
| M3 | Dashboard | KPI cards + charts (revenue/cost/profit × day/week/month/year, category donut, top products, recent sales, low-stock, expiring) all computed from live SQL; numbers match manual SQL cross-check |
| M4 | Inventory & catalog | Products/Categories/Brands/Units/Stock/Movements/Adjustments/Low-stock/Expiring pages; CSV import w/ validation report + export; invariant: **every stock delta has a movement row** (test-enforced) |
| M5 | POS + Sales + Invoices | POS <1s search (indexed + debounced), barcode scan input, keyboard shortcuts, split payments; checkout txn per F2; thermal-friendly printable invoice; cancel/refund reverse exactly (tests assert stock+balances restored) |
| M6 | Procurement | Suppliers CRUD, PO status machine, receiving per F4 (partial receipts + batches + expiries), purchase returns per F5 |
| M7 | Customers, credit, loyalty | Statements, add-payment/debt recording, credit-limit enforcement inside sale txn, loyalty earn/redeem/history |
| M8 | Reports + financials | 8 report families per §24 + financial summary per §25 with documented formula; CSV/Excel/print verified; profit validated against independent SQL |
| M9 | Expenses, notifications center, global search | Expense CRUD feeds reports; notification center surfaces low/out-of-stock, expiry, pending POs, credit breaches |
| M10 | Audit viewer, backups, settings, security hardening | Audit filters viewer; backup record + download (no credential exposure); settings pages persist & affect behavior (tax, prefixes, thresholds); security checklist §27 signed off |
| M11 | Perf + responsive + RTL/i18n + dark mode | Server pagination everywhere; no horizontal overflow (mobile/tablet/desktop); ar/en switch persists, correct RTL mirroring; dark mode |
| M12 | Test suite + prod build + final audit | §49 test matrix green; `npm run build` clean; §53 checklist fully ticked |

## [ORPHANS & PENDING]

- ⏳ RESOLVED: postgres superuser password = `123` → `.env` updated; `npx prisma migrate dev --name init` created `grocery_db` + applied `20260823020727_init`; seed ran OK (7 users/6 roles/40 perms/42 products/6 suppliers/24 customers/170 sales/575 movements/31 batches). SQL cross-check: 42 products ↔ 42 inventory rows.
- ⏳ RESOLVED: Next 16 deprecated `middleware` convention → migrated to `src/proxy.ts` exporting named `proxy()` (same logic/matcher); build shows "ƒ Proxy (Middleware)", no deprecation warning.
- Runtime verification done via `scripts/smoke.ts` (`npx tsx scripts/smoke.ts`, needs tsconfig path stub `server-only` → `scripts/stubs/server-only.ts`): 22/22 PASS covering F6 adjustment (+qty, ADJ seq), F2 checkout (INV-%06d numbering, cost snapshot, stock decrement, SALE movements, overpay→changeDue), F3 return (partial refund status, restock +1, over-return rejected), cancel-after-refund blocked, credit-only sale (empty payments → creditAmount=total, balance raise, DEBT txn), cancel reversal (stock restored, balance reversed exactly, CANCELLED).
- Service-layer contract confirmed at runtime: services return RAW data / throw AppError (no ApiResult wrapper) — ApiResult wrapping happens only in actions.ts via guard(). createSale returns `{saleId, invoiceNumber, total, paid, changeDue, credit, pointsEarned}`. Credit remainder is NOT a SalePayment row — it lives in sale.creditAmount + customer ledger.
- HTTP smoke: `/login` 200 with form; `/dashboard` 307 redirect when unauthenticated.
- Known lint note: product-form.tsx has an informational `react-hooks/incompatible-library` warning (RHF `watch()`) — expected, compiler just skips memoizing that component. Only remaining lint warning.

## [M12 NOTES] (auth hardening + §49 test matrix + final verification — COMPLETE)
- **mustChangePassword enforcement (was set but never checked)**: `changeOwnPasswordSchema` (min 6 + confirm match) in auth/schema.ts; `changeOwnPassword(userId, pw)` in auth/service.ts enforces SystemSettings.passwordMinLength (WEAK_PASSWORD), bcrypt rounds 12, clears mustChangePassword/failedLoginAttempts/lockedUntil, audits PASSWORD_CHANGE_SELF; `changeOwnPasswordAction` in actions.ts; `ui/change-password-form.tsx` + `(auth)/change-password/page.tsx`; **`(app)/layout.tsx` redirects to /change-password when user.mustChangePassword**. HTTP-verified: flagged cashier → /dashboard 307 /change-password; page 200 authed.
- **requestMeta() made request-scope-safe**: `headers()` wrapped in try/catch returning {ip:null,userAgent:null} outside requests — smoke scripts can now call authenticate() directly (production unaffected).
- **scripts/smoke-auth.ts** (16 checks): valid login, INVALID_CREDENTIALS + failedLoginAttempts increment, ACCOUNT_LOCKED at settings.maxLoginAttempts with lockedUntil set + attempts reset, correct password rejected while locked, unknown identity uniform error (no enumeration), suspended blocked, reset token issued/weak rejected/single-use/login-after-reset, self-change min-length + flag cleared. Isolation: purges `loginActivity where ip = null` (script requests carry no X-Forwarded-For) so the IP throttle (20 fails/10 min) never leaks between runs — without this the suite passes once then throttles itself.
- **scripts/test-all.ts**: §49 matrix runner — executes all 7 suites via `spawnSync("npx", ["tsx", file], { shell: true })` (bare node can't resolve @/ paths/server-only stub) and prints a summary table. Final: Auth 16 / Sales 21 / Procurement 24 / Customers 19 / Reports 28 / M9 16 / M10 30 = **154 ALL GREEN**.
- mint-session.ts now takes optional username arg (`npx tsx scripts/mint-session.ts cashier`) for testing non-admin sessions.
- Fixed lint warning: change-password-form logout used window.location.href → router.replace("/login") (back to known baseline of only the RHF watch warning).
- ar.ts i18n keys inserted via Node fs script pattern again (PowerShell console garbles Arabic). Logger redacts `token` automatically ("token":"[REDACTED]" observed in reset-token log).
- Final sweep: typegen ✓ tsc ✓ lint (1 known warning) build ✓ Compiled successfully; 13 routes 200 authed (dashboard, pos, products, purchase-orders, customers/list, expenses, reports/summary, users, roles, audit-log, settings/store, settings/backup, change-password); anon → 307 login?next=.

## [M11 NOTES] (perf + responsive + RTL/i18n + dark mode — audit & fixes)
- **Audit results (mostly already compliant from M0–M10 build style)**: zero physical `ml-/mr-/pl-/pr-` or `text-left/right` classes anywhere (logical `ms-/me-/ps-/pe-/text-start/text-end` used throughout); every `<Table>` is wrapped by ui/table.tsx in `overflow-x-auto`; all multi-col grids carry sm:/md: prefixes (only fixed width = receipt page `max-w-[420px]`, intentional for thermal print); mobile nav via Sheet in topbar; POS search debounced 250ms with dynamic action import; all searches capped (`take: 20`); all list pages server-paginated via shared Pagination.
- **Fix applied**: dashboard SalesChart now lazy-loaded — new `sales-chart-lazy.tsx` client wrapper using `next/dynamic` ({ ssr:false, loading: Skeleton }) so recharts leaves the initial dashboard bundle. Gotcha: dynamic() requires a DEFAULT export on the target module (added `export default SalesChart`).
- **Dark mode verified**: next-themes ThemeProvider attribute="class" defaultTheme="system" + globals.css `@custom-variant dark` + `.dark {}` token overrides; topbar dropdown toggles light/dark/system.
- **i18n/RTL runtime-verified over HTTP**: gs_locale=ar → html dir="rtl" + Arabic labels; gs_locale=en → dir="ltr" + English; switch persists via cookie (setLocaleAction) AND settings.language (M10 localization page).

## [M10 NOTES] (audit viewer + users + roles + settings + backups — implemented per M10 row)
- **Settings** `src/features/settings/{schema,service,actions}.ts` + `ui/settings-forms.tsx`: singleton upserts (id "store"/"system"). Pages /settings/{store,sales,inventory,localization,security} (all in nav; sales/inventory items added). Localization save also sets gs_locale cookie + revalidates layout. Every section writes audit SETTINGS_UPDATE. Behavior verified: invoicePrefix drives new sale numbering (SMX- test), restored after.
- **Audit viewer** `src/features/audit/service.ts` + /audit-log page: filters user/action(ILIKE)/entityType/date-range, facets via `distinct` selects for dropdowns, Pagination. GET form (no client JS).
- **Users** `src/features/users/**` + /users: create (bcrypt hash, mustChangePassword=true), edit (password optional), suspend/activate (revokes sessions), soft-delete. Guards: self role/status/delete blocked; username/email uniqueness checked INCLUDING soft-deleted rows (DB unique index ignores deletedAt — dup query must not filter it); password min length from SystemSettings.passwordMinLength; last-active-SUPER_ADMIN demote/suspend/delete blocked.
- **Roles** `src/features/roles/**` + /roles: checkbox permission grid grouped by PERMISSIONS groups; perm sync = deleteMany+create in update; custom roles delete only when unassigned; isSystem roles undeletable; SUPER_ADMIN role edits blocked entirely (wildcard by code). RoleDialog takes PermissionGroup[] = `[group, {key,description}[]][]`.
- **Backups** `src/features/backups/**` + /settings/backup + GET /api/backups/[id]/download: server-side pg_dump spawn (PG_DUMP_PATH or PostgreSQL16 default path; PGPASSWORD in child env only), plain-SQL file under ./backups (gitignored), BackupRecord IN_PROGRESS→COMPLETED with sizeBytes BigInt→Number at boundary; download streams file (permission-gated, no credentials in response/dump); delete removes file+row. Smoke asserts dump header has no PGPASSWORD/:123@.
- Security headers added in next.config.ts (X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy). §27 checklist: bcrypt(10), httpOnly+lax+secure-in-prod cookie, DB-backed session revocation, lockout via maxLoginAttempts/lockoutMinutes settings, generic auth errors, server-side requirePermission on every action/route, audit trail incl. old/new values, no client-trusted prices.
- Smoke scripts/smoke-m10.ts 30/30 PASS (and idempotent — purges its own leftovers, restores settings/store rows unconditionally so crashed runs can't poison the baseline; a prior crash once left invoicePrefix=SMX- which made smoke.ts fail until manually reset to INV-). Gotchas hit: ProductBatch field is expiryDate; sale-test cleanup must use cancelSale (raw sale.delete would corrupt stock/movements); pick batch with quantity>0 & expiryDate>now for sellable product; username uniqueness is absolute in PG — dup checks must NOT filter deletedAt.

## [M9 NOTES] (expenses + notifications + global search — implemented per M9 row)
- `src/features/expenses/{schema,service,actions}.ts` + `ui/expense-forms.tsx` (NewExpenseDialog w/ Select-controlled categoryId/method; ExpenseCategoryManager list+create). Page /expenses (filters categoryId/from/to, EXP-%06d rows, category badge links) + delete-expense-button. Delete allowed only within 24h of createdAt — computed SERVER-side in listExpenses (`deletable` flag); never call Date.now() during client render.
- `src/features/notifications/service.ts`: scanCandidates → syncNotifications upserts unread rows deduped on **(type, entityId)**; families LOW_STOCK/OUT_OF_STOCK/EXPIRING/EXPIRED/PENDING_PO/CREDIT_LIMIT; read rows are never re-created while condition persists; markAllRead; unreadCount.
- `src/features/search/{service,actions}.ts` globalSearch(q): min length 2 ("a" returns empty — smoke must use ≥2 chars), products(name/nameAr/sku/barcode exact)/customers(+phone)/suppliers/invoices(invoiceNumber startsWith), top 5 each.
- Shell: `src/features/shell/global-search.tsx` (Ctrl/Cmd+K, debounced 250ms dynamic action import, CommandDialog groups → product/customer/supplier/receipt routes), `notifications-bell.tsx` (Popover bell, unread badge, mark-all, HREF_BY_TYPE/LABEL_KEY_BY_TYPE into new `t.notif` dict section en+ar), topbar rewired (GlobalSearch + NotificationsBell replaced static Input/Bell).
- Layout calls `syncNotifications()` and maps rows for the bell (createdAt → ISO string before crossing RSC boundary).
- Smoke: scripts/smoke-m9.ts 16/16 PASS. HTTP: dashboard HTML renders search trigger (kbd "Ctrl K" + localized placeholder) and bell icon; all routes 200 authed via curl.exe.
- **HTTP-test gotcha**: PowerShell Invoke-WebRequest misreports redirect-sensitive checks (-MaximumRedirection 0 unreliable) → use `curl.exe -s -i --max-redirs 0 -H "Cookie: gs_session=$token"`. Mint tokens with `scripts/mint-session.ts` (stdout last line = JWT; creates Session row for superadmin).
- Dev-server note: run on port 3001 (`npx next dev -p 3001`, Start-Process hidden window); port 3000 is occupied by an unrelated project (`haithamPortfolio3DNew`) — do NOT kill it. After running `npm run build`, restart the dev server (build clobbers .next and stale instances served broken output).

## [M8 NOTES] (reports + financials — implemented per §24/§25/F7)
- `src/features/reports/{schema,service,actions}.ts` + ui/ (report-shell: ReportHeader GET date-range form / SummaryCards / ReportSection; print-button).
- Pages: /reports/{sales,purchases,profit,inventory,customers,suppliers,tax,expenses} + **/reports/summary** (§25 financial summary; nav entry added under Reports using existing `financialSummary` label key).
- Documented formulas (service.ts header + rendered on profit page): Net Sales(incl) = Σ sale.total − Σ sale_returns.total · Net Sales(excl tax) = Σ(total − taxTotal) − returns · COGS(net) = Σ costTotal − Σ return costTotal · Gross Profit = Net(excl) − COGS · Net Profit = Gross Profit − Expenses · Output/Input VAT = Σ sales/purchases.taxTotal · Inventory Value = Σ(qty × product.costPrice). Sale returns carry NO tax by design (§24 proportionality simplification in createSaleReturn) — output tax needs no adjustment.
- Active-sale statuses everywhere: COMPLETED + PARTIALLY_REFUNDED. Range parsing: parseReportRange normalizes YYYY-MM-DD searchParams, `to` inclusive on input → exclusive internally, defaults month-to-date.
- Aggregates: Prisma aggregate for summaries; $queryRaw date_trunc buckets (day/month), generate_series month spine for profit/tax so empty months still render; customers/suppliers reports join per-range aggregates onto live balances (receivables/payables = Σ balance>0).
- Export: exportReportAction(family, fromISO, toISO) bound per-page via .bind() into the shared ExportCsvButton (BOM + blob download); PrintButton window.print().
- i18n: ~20 new keys added to reports section of en.ts AND ar.ts (byDay/byMonth/tax labels/payables/receivables/etc.).
- Smoke: scripts/smoke-reports.ts — 28/28 PASS; every headline number cross-checked against INDEPENDENT raw SQL ground truth (not the service's own queries), identity checks (grossProfit/netProfit/VAT), empty-range zero/NaN guard, CSV headers for all 8 families.
- Gotchas: dict has no `t.tax` — use `t.common.tax`; category label is `t.products.category` not `t.categories.*`; customers dict keys are code/creditLimit directly (no `.name` — use reports.customerCol).

## [M7 NOTES] (customers/credit/loyalty — implemented per F6)
- `src/features/customers/{schema,service,actions}.ts` + `ui/{customer-form,credit-forms}.tsx` (CustomerTxnDialog / LoyaltyAdjustDialog / GroupFormDialog).
- Pages: /customers/list (+ CustomerLauncher client launcher with form/payment/loyalty modes; ?edit= preloads), /customers/groups (+GroupLauncher + delete-group-button), /customers/transactions (filterable ledger), /customers/loyalty (history). All in nav-config.
- saveCustomer: code CUS-%04d via count()+1; softDeleteCustomer blocked while balance > 0 (IN_USE); groups: deleteGroup blocked when members exist.
- recordCustomerTxn txn: PAYMENT rejected if amount > balance; DEBT enforces creditLimit when limit > 0 (CREDIT_LIMIT_EXCEEDED); writes CustomerTransaction w/ balanceAfter chain + audit CUSTOMER_{TYPE}. Credit remainder from sales is NOT a row here (lives on sale.creditAmount) but shows in statements via sale linkage.
- getStatement: customer + txns + loyalty oldest-first (take 500).
- adjustLoyalty: REDEEM converts points → balance credit at SystemSettings.loyaltyPointValue (writes ADJUSTMENT CustomerTransaction "Loyalty redeem N pts"); ADJUST allows negative corrections, rejects negative result. LoyaltyTransaction.balanceAfter tracks points.
- Smoke: scripts/smoke-customers.ts — 19/19 PASS (code gen, DEBT/PAYMENT balances, credit-limit, over-payment, statement order/chain, loyalty grant/redeem/credit, soft-delete guard, group IN_USE).
- Launcher gotcha resolved: dialogs own their dict props; keep launcher props optional and pass `?? []` for lists to satisfy strict TS across all call-site modes.

## [M6 NOTES] (procurement — implemented per F4/F5)
- `src/features/procurement/{schema,service,actions}.ts` + `ui/` (supplier-form, supplier-launcher, product-picker, po-builder, receiving-builder, return-wizard, pay-dialog).
- Pages: /procurement/suppliers, /purchase-orders (+/new builder), /receiving (?po= preloads PO context), /purchases (inline PayPurchaseDialog), /returns (+/new wizard ?purchase= preselect). All in nav-config already.
- Numbering: fixed prefixes PO-/PUR-/PRE- + 6 digits (no settings key for these; invoicePrefix only covers sales).
- PO machine: DRAFT→PENDING→APPROVED→ORDERED→PARTIALLY_RECEIVED→RECEIVED; cancel allowed until receiving starts; transitions enforced server-side (INVALID_STATE otherwise).
- receivePurchase (Serializable): validates supplier/product active, PO same-supplier + open-qty guard (OVER_RECEIPT), line math via money.ts, due = total − paid (paid ≤ total), creates Purchase+items, ProductBatch per batch-tracked line w/ batchNo/expDate (costPrice field name on batches!), PURCHASE movements refType Purchase refId=purchaseItem.id (positive qty), inventory upsert-increment, supplier.balance += due, PO receivedQty increments + status roll-up, audit PURCHASE_CREATE.
- payPurchase: paidAmount+=/dueAmount−=/supplier.balance −= inside txn; rejects amount > due.
- createPurchaseReturn: cap = purchased − Σ(alreadyReturned) per product across ALL prior returns (OVER_RETURN); FEFO batch consumption like sales; PURCHASE_RETURN movements negative qty refType PurchaseReturn; inventory decrement; CASH → refundAmount / CREDIT → creditAmount + supplier.balance −= total; audit PURCHASE_RETURN_CREATE.
- recordAudit signature is (client, entry) with entityType — NOT (entry). Pass db outside txns, tx inside.
- Smoke: scripts/smoke-procurement.ts — 24/24 PASS incl. over-receipt/over-return/state-machine rejections.

## [M5 NOTES] (sales — implemented per F2/F3)
- `createSale` = one Serializable txn: server-side price truth → merged qty/stock check → line math (lineTotal/taxOf/money HALF_UP) → invoice discount → payments split w/ auto-credit remainder → credit-limit check inside txn → FEFO batch deduction → SALE movements w/ cost snapshot → inventory decrement → customer balance/loyalty/CustomerTransaction side-effects → audit.
- Invoice numbering from SystemSettings.invoicePrefix (`INV-` + 6 digits); adjustments use ADJ-000001 seq; returns SRN- seq.
- `cancelSale` reverses exactly: restores aggregate stock, status CANCELLED, reverses customer balance/loyalty; blocked if returns exist.
- `createSaleReturn`: validates qty ≤ sold − already-returned across ALL prior returns; restocks to ORIGINAL batch when the original SALE movement carried one (else synthetic RET batch); refund CASH vs CREDIT (customer balance −= , REFUND CustomerTransaction); sale.refundedAmount/status updated PARTIALLY_REFUNDED→REFUNDED.
- POS UI (`/sales/pos`): debounced server-action search, barcode Enter lookup, cart +/-, invoice discount gated by `sales.discount`, split payment method + change-due preview, walk-in default, success dialog w/ print link.
- Receipt `/sales/receipt/[id]`: thermal-friendly white-on-black-free minimal layout, auto window.print() after 300ms.
- Returns UI: `/sales/returns/new` wizard (invoice lookup → per-line return qty ≤ max → reason/restock/refund) + `/sales/returns` history list.
- RSC serialization: Decimal fields must be mapped to strings BEFORE crossing the server-action boundary (posSearchAction does this).

## [DECISION LOG]
- 2026-08-24: M12 closed the project. mustChangePassword now enforced at the (app) layout boundary; auth services made callable outside request scope via safe requestMeta() so the §49 matrix can exercise them directly.
- 2026-08-23: Chose custom jose-based sessions over next-auth (v4 incompatible-era with Next 16, v5 beta-only). Reversible at M2 start if overridden.
- 2026-08-23: Money = numeric(14,2) + decimal.js; costs snapshotted onto documents so historical profit never drifts with price edits.
- 2026-08-23: Feature-module structure (schema/service/actions/ui per domain) instead of global micro-folders.
- 2026-08-23: Prisma 7 runtime requires driver adapter — `PrismaClient({ adapter })` + `@prisma/adapter-pg`; client generated to `src/generated/prisma` (import `@/generated/prisma/client`); pg URL must NOT carry `?schema=`.
- 2026-08-23: TS gate resolved in favor of typescript@^5.9.3 (TS7 broke eslint toolchain).
- 2026-08-23: Enum list filters in Prisma 7 need explicit `{ in: [...] }` with generated enum values; aggregate `_sum` is optional-chained.
- 2026-08-23: Next 16 typed routes — route-group layouts take `{ children }` inline type; run `npx next typegen` after adding new routes before tsc.
- 2026-08-23: Next 16 `searchParams` is `string | string[] | undefined` — normalize with `firstParam()` from `@/components/pagination` before use.
- 2026-08-23: Inventory invariants — every product gets an `Inventory` row at creation (qty 0); manual stock changes ONLY via `createAdjustment` txn (adjustment + movement + inventory, FEFO batch consumption on decrease, synthetic ADJ batch on increase). Dashboard re-uses `listLowStock`/`listExpiringBatches` from inventory service (no duplicated queries).
- 2026-08-23: Product soft-delete blocked if any SaleItem exists (IN_USE); categories/brands/units delete-blocked when referenced.
