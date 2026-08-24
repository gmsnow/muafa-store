/**
 * Granular permission catalog (spec §3) + default role matrix.
 * Single source of truth used by seed + runtime guards.
 */

export interface PermissionDef {
  key: string;
  group: string;
  description: string;
}

function perms(group: string, defs: Record<string, string>): PermissionDef[] {
  return Object.entries(defs).map(([key, description]) => ({
    key: `${group}.${key}`,
    group,
    description,
  }));
}

export const PERMISSIONS: PermissionDef[] = [
  ...perms("dashboard", { view: "View main dashboard" }),
  ...perms("products", {
    view: "View products",
    create: "Create products",
    update: "Update products",
    delete: "Delete products",
    import: "Bulk import products",
    export: "Export products",
  }),
  ...perms("catalog", { categories: "Manage categories", brands: "Manage brands", units: "Manage units" }),
  ...perms("inventory", {
    view: "View stock levels",
    movements: "View inventory movements",
    adjust: "Create stock adjustments",
    batches: "Manage batches & expiration",
  }),
  ...perms("sales", {
    view: "View sales",
    create: "Create sales (POS)",
    cancel: "Cancel sales",
    refund: "Process sale returns/refunds",
    discount: "Apply invoice-level discounts",
  }),
  ...perms("procurement", {
    view: "View procurement",
    create: "Create purchase orders/purchases",
    receive: "Receive purchases",
    return: "Process purchase returns",
  }),
  ...perms("suppliers", { view: "View suppliers", manage: "Manage suppliers" }),
  ...perms("customers", {
    view: "View customers",
    create: "Create customers",
    update: "Update customers",
    credit: "Manage customer credit & payments",
    loyalty: "Adjust loyalty points",
  }),
  ...perms("reports", { view: "View reports" }),
  ...perms("expenses", { view: "View expenses", manage: "Manage expenses" }),
  ...perms("users", { view: "View users", manage: "Manage users & permissions" }),
  ...perms("roles", { manage: "Manage roles & permission assignments" }),
  ...perms("settings", { view: "View settings", manage: "Change settings" }),
  ...perms("backup", { manage: "Create/download backups" }),
  ...perms("audit", { view: "View audit log" }),
];

export type PermissionKey = string;

/** Roles that exist out of the box. SUPER_ADMIN uses "*" wildcard. */
export const ROLE_MATRIX: Record<string, PermissionKey[] | "*"> = {
  SUPER_ADMIN: "*",
  ADMINISTRATOR: [
    // Everything except critical system operations (backups, role editing)
    "dashboard.view",
    "products.view", "products.create", "products.update", "products.delete", "products.import", "products.export",
    "catalog.categories", "catalog.brands", "catalog.units",
    "inventory.view", "inventory.movements", "inventory.adjust", "inventory.batches",
    "sales.view", "sales.create", "sales.cancel", "sales.refund", "sales.discount",
    "procurement.view", "procurement.create", "procurement.receive", "procurement.return",
    "suppliers.view", "suppliers.manage",
    "customers.view", "customers.create", "customers.update", "customers.credit", "customers.loyalty",
    "reports.view",
    "expenses.view", "expenses.manage",
    "users.view", "users.manage",
    "settings.view", "settings.manage",
    "audit.view",
  ],
  MANAGER: [
    "dashboard.view",
    "products.view", "products.create", "products.update", "products.export",
    "catalog.categories", "catalog.brands", "catalog.units",
    "inventory.view", "inventory.movements", "inventory.adjust", "inventory.batches",
    "sales.view", "sales.create", "sales.cancel", "sales.refund", "sales.discount",
    "procurement.view", "procurement.create", "procurement.receive", "procurement.return",
    "suppliers.view", "suppliers.manage",
    "customers.view", "customers.create", "customers.update", "customers.credit", "customers.loyalty",
    "reports.view",
    "expenses.view",
    "settings.view",
  ],
  CASHIER: [
    "products.view",
    "sales.view", "sales.create", "sales.discount",
    "customers.view", "customers.create", "customers.update",
  ],
  INVENTORY_MANAGER: [
    "dashboard.view",
    "products.view", "products.create", "products.update", "products.delete", "products.import", "products.export",
    "catalog.categories", "catalog.brands", "catalog.units",
    "inventory.view", "inventory.movements", "inventory.adjust", "inventory.batches",
    "procurement.view", "procurement.create", "procurement.receive", "procurement.return",
    "suppliers.view", "suppliers.manage",
    "reports.view",
  ],
  ACCOUNTANT: [
    "dashboard.view",
    "products.view",
    "inventory.view",
    "sales.view",
    "procurement.view",
    "suppliers.view",
    "customers.view",
    "reports.view",
    "expenses.view", "expenses.manage",
  ],
};

export const ROLE_NAMES_AR: Record<string, string> = {
  SUPER_ADMIN: "مدير النظام",
  ADMINISTRATOR: "مسؤول",
  MANAGER: "مدير",
  CASHIER: "أمين صندوق",
  INVENTORY_MANAGER: "مدير المخزون",
  ACCOUNTANT: "محاسب",
};

export function hasPermission(permissions: Iterable<PermissionKey>, required: PermissionKey): boolean {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has("*") || set.has(required);
}
