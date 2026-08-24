"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronsLeft, ChevronsRight, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dictionary } from "@/shared/i18n";
import { NAV_GROUPS, navLabel } from "./nav-config";

interface Props {
  t: Dictionary;
  permissions: string[];
  storeName: string;
}

function hasPerm(perms: string[], key?: string) {
  if (!key) return true;
  return perms.includes("*") || perms.includes(key);
}

export function Sidebar({ t, permissions, storeName }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const visible = NAV_GROUPS.filter((g) => hasPerm(permissions, g.permission)).map((g) => ({
    ...g,
    items: g.items.filter((i) => hasPerm(permissions, i.permission)),
  })).filter((g) => g.items.length > 0);

  const CollapseIcon = collapsed ? ChevronsLeft : ChevronsRight;

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-e bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="size-4" />
        </div>
        {!collapsed && <span className="truncate text-sm font-bold">{storeName}</span>}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {visible.map((group, gi) => (
          <div key={gi} className="mb-2">
            {group.labelKey && !collapsed && (
              <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{navLabel(t.nav, t.reports, group.labelKey)}</p>
            )}
            {group.labelKey && collapsed && <div className="mx-2 my-2 border-t" />}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? navLabel(t.nav, t.reports, item.labelKey) : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="truncate">{navLabel(t.nav, t.reports, item.labelKey)}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex h-10 items-center justify-center gap-2 border-t text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="toggle sidebar"
      >
        <CollapseIcon className="size-4" />
        {!collapsed && <span className="text-xs">طي</span>}
      </button>
    </aside>
  );
}

