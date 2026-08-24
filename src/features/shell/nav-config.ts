import {
  LayoutDashboard, Package, FolderTree, Warehouse,
  CalendarClock, ShoppingCart, ReceiptText,
  Building2, FileText, PackageOpen, RotateCcw, UsersRound,
  CreditCard, LineChart, Wallet, UserCog, KeyRound, ScrollText, Settings2,
  Store, Globe2, ShieldCheck, DatabaseBackup, type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/shared/i18n";

export type NavLabelKey = keyof Dictionary["nav"] | keyof Dictionary["reports"];

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  permission?: string;
}

export interface NavGroup {
  labelKey: keyof Dictionary["nav"] | null;
  icon?: LucideIcon;
  permission?: string;
  items: NavItem[];
}

/** Resolve a nav item label from either the nav or reports dictionary section. */
export function navLabel(nav: Dictionary["nav"], reports: Dictionary["reports"], key: NavLabelKey): string {
  return (nav as Record<string, string>)[key] ?? (reports as Record<string, string>)[key] ?? String(key);
}

export const NAV_GROUPS: NavGroup[] = [
  { labelKey: null, items: [{ href: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, permission: "dashboard.view" }] },
  {
    labelKey: "inventory", icon: Package, permission: "products.view",
    items: [
      { href: "/inventory/products", labelKey: "products", icon: Package, permission: "products.view" },
      { href: "/inventory/categories", labelKey: "categories", icon: FolderTree, permission: "catalog.categories" },
      { href: "/inventory/stock", labelKey: "stock", icon: Warehouse, permission: "inventory.view" },
      { href: "/inventory/expiring", labelKey: "expiring", icon: CalendarClock, permission: "inventory.batches" },
    ],
  },
  {
    labelKey: "sales", icon: ShoppingCart, permission: "sales.view",
    items: [
      { href: "/sales/pos", labelKey: "pos", icon: ShoppingCart, permission: "sales.create" },
      { href: "/sales/orders", labelKey: "orders", icon: ReceiptText, permission: "sales.view" },
    ],
  },
  {
    labelKey: "procurement", icon: Building2, permission: "procurement.view",
    items: [
      { href: "/procurement/suppliers", labelKey: "suppliers", icon: Building2, permission: "suppliers.view" },
      { href: "/procurement/purchase-orders", labelKey: "purchaseOrders", icon: FileText, permission: "procurement.create" },
      { href: "/procurement/purchases", labelKey: "purchases", icon: PackageOpen, permission: "procurement.view" },
      { href: "/procurement/returns", labelKey: "purchaseReturns", icon: RotateCcw, permission: "procurement.return" },
    ],
  },
  {
    labelKey: "customers", icon: UsersRound, permission: "customers.view",
    items: [
      { href: "/customers/list", labelKey: "customersList", icon: UsersRound, permission: "customers.view" },
      { href: "/customers/transactions", labelKey: "customerTransactions", icon: CreditCard, permission: "customers.credit" },
    ],
  },
  {
    labelKey: "reports", icon: LineChart, permission: "reports.view",
    items: [
      { href: "/reports/sales", labelKey: "salesReport", icon: LineChart, permission: "reports.view" },
      { href: "/reports/purchases", labelKey: "purchasesReport", icon: LineChart, permission: "reports.view" },
      { href: "/reports/profit", labelKey: "profitReport", icon: LineChart, permission: "reports.view" },
      { href: "/reports/inventory", labelKey: "inventoryReport", icon: Warehouse, permission: "reports.view" },
      { href: "/reports/customers", labelKey: "customersReport", icon: UsersRound, permission: "reports.view" },
      { href: "/reports/suppliers", labelKey: "suppliersReport", icon: Building2, permission: "reports.view" },
      { href: "/reports/expenses", labelKey: "expensesReport", icon: Wallet, permission: "reports.view" },
      { href: "/reports/summary", labelKey: "financialSummary", icon: LineChart, permission: "reports.view" },
    ],
  },
  { labelKey: null, items: [{ href: "/expenses", labelKey: "expenses", icon: Wallet, permission: "expenses.view" }] },
  {
    labelKey: "usersSection", icon: UserCog, permission: "users.view",
    items: [
      { href: "/users", labelKey: "users", icon: UserCog, permission: "users.view" },
      { href: "/roles", labelKey: "roles", icon: KeyRound, permission: "roles.manage" },
      { href: "/audit-log", labelKey: "auditLog", icon: ScrollText, permission: "audit.view" },
    ],
  },
  {
    labelKey: "settings", icon: Settings2, permission: "settings.view",
    items: [
      { href: "/settings/store", labelKey: "store", icon: Store, permission: "settings.view" },
      { href: "/settings/sales", labelKey: "sales", icon: ShoppingCart, permission: "settings.view" },
      { href: "/settings/inventory", labelKey: "inventory", icon: Warehouse, permission: "settings.view" },
      { href: "/settings/localization", labelKey: "localization", icon: Globe2, permission: "settings.view" },
      { href: "/settings/security", labelKey: "security", icon: ShieldCheck, permission: "settings.manage" },
      { href: "/settings/backup", labelKey: "backup", icon: DatabaseBackup, permission: "backup.manage" },
    ],
  },
];
