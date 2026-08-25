"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { LogOut, Menu, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Dictionary } from "@/shared/i18n";
import { NAV_GROUPS, navLabel } from "./nav-config";
import { GlobalSearch } from "./global-search";
import { NotificationsBell, type NotificationItem } from "./notifications-bell";
import { VoiceDictation } from "./voice-dictation";
import { OfflineIndicator } from "./offline-indicator";

interface Props {
  t: Dictionary;
  userName: string;
  roleName: string;
  permissions: string[];
  notifications: NotificationItem[];
  storeName?: string;
  aiVoice?: boolean;
}

function hasPerm(perms: string[], key?: string) {
  if (!key) return true;
  return perms.includes("*") || perms.includes(key);
}

function setThemeSafe(theme: string) {
  if (typeof document !== "undefined") document.documentElement.classList.toggle("dark", theme === "dark");
}

export function Topbar({ t, userName, roleName, permissions, notifications, storeName, aiVoice }: Props) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const logout = async () => {
    const { logoutAction } = await import("@/features/auth/actions");
    const res = await logoutAction();
    if (res.ok) window.location.href = res.data.redirect;
    else toast.error(res.error.message);
  };

  const visible = NAV_GROUPS.filter((g) => hasPerm(permissions, g.permission)).map((g) => ({
    ...g,
    items: g.items.filter((i) => hasPerm(permissions, i.permission)),
  })).filter((g) => g.items.length > 0);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
      {/* Mobile nav */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="menu">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 overflow-y-auto p-2">
          <SheetHeader>
            <SheetTitle>{storeName ?? t.auth.storeName}</SheetTitle>
          </SheetHeader>
          <nav className="mt-2 space-y-2 px-1 pb-6">
            {visible.map((group, gi) => (
              <div key={gi}>
                {group.labelKey && <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{navLabel(t.nav, t.reports, group.labelKey)}</p>}
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2.5 rounded-md px-2 py-2 text-sm ${active ? "bg-accent font-medium" : ""}`}
                        >
                          <Icon className="size-4" />
                          {navLabel(t.nav, t.reports, item.labelKey)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Global search */}
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <GlobalSearch t={t} />
      </div>

      <div className="ms-auto flex items-center gap-1">

        {/* Offline state + pending sync queue */}
        <OfflineIndicator t={t} />

        {/* Voice input — Cloudflare AI (Whisper) when configured, Web Speech otherwise */}
        <VoiceDictation aiMode={aiVoice} />

        {/* Theme — one-click toggle light/dark */}
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          aria-label="theme"
          onClick={() => {
            const next = resolvedTheme === "dark" ? "light" : "dark";
            setTheme(next);
            setThemeSafe(next);
          }}
        >
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>

        {/* Notifications */}
        <NotificationsBell t={t} items={notifications} />

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <UserRound className="size-4" />
              <span className="hidden max-w-28 truncate text-sm sm:inline">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="text-xs font-normal text-muted-foreground">{roleName}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout}>
              <LogOut className="size-4" /> {t.auth.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

