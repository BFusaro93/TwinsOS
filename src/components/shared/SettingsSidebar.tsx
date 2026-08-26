"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, UserCog, Wrench, Sprout, HelpCircle, Library } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/utils";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import type { LucideIcon } from "lucide-react";

interface SettingsNavItem {
  key: "master" | "equipt" | "landscapt" | "support" | "docs";
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;
  description: string;
}

export function SettingsSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUIStore();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { currentUser } = useCurrentUserStore();
  const { isAdmin, roleId } = usePermissions();

  // Requisitions/POs, Vendors, and Products are shared with Landscapt-only
  // orgs (no Equipt module) — this page is still fully reachable to them
  // (nothing here is module-gated), but "Equipt Settings" reads as "not for
  // me" and buries the approval-flow/costing config they DO need.
  const { allowed: hasEquipt } = useModuleAccess("equipt");

  const SETTINGS_NAV: SettingsNavItem[] = [
    { key: "master",    label: "Master Account", href: "/settings", icon: UserCog, exact: true, description: "Users, organization, branding & billing" },
    hasEquipt
      ? { key: "equipt", label: "Equipt Settings", href: "/settings/equipt", icon: Wrench, description: "CMMS & purchasing configuration" }
      : { key: "equipt", label: "Purchasing Settings", href: "/settings/equipt", icon: Wrench, description: "Vendors, requisition & PO approval flows, and inventory costing" },
    { key: "landscapt", label: "Landscapt Settings", href: "/settings/landscapt", icon: Sprout, description: "CRM & field service configuration" },
    { key: "support",   label: "Support", href: "/settings/support", icon: HelpCircle, description: "Guides, FAQ, and contact" },
    { key: "docs",      label: "Docs", href: "/settings/docs", icon: Library, description: "Step-by-step guides for every part of the platform" },
  ];

  // Master Account is admin-only; Equipt Settings is admin/manager (must
  // match EQUIPT_SETTINGS_ROLES in EquiptSettingsTabs.tsx); Landscapt
  // Settings just needs CRM access at all (roleId set, or admin) — every
  // Landscapt user can reach at least the Notifications tab there
  // regardless of their settings_access permissions (see
  // LANDSCAPT_TAB_PERMISSIONS), so there's no settings-permission check to
  // mirror here the way there is for the other two.
  const visibleNav = SETTINGS_NAV.filter((item) => {
    if (item.key === "master") return isAdmin || currentUser.role === "admin";
    if (item.key === "equipt") return currentUser.role === "admin" || currentUser.role === "manager";
    if (item.key === "landscapt") return isAdmin || roleId !== null;
    return true;
  });

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-[#1e1e1e] transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-[#2a2a2a] px-4">
        <div className="flex min-w-0 items-center gap-2">
          {logoDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDataUrl} alt={orgName} className="h-7 w-7 shrink-0 rounded-md object-contain" />
              {!sidebarCollapsed && <span className="truncate text-lg font-bold text-brand-400">Settings</span>}
            </>
          ) : (
            <>
              <BrandMark variant="reversed" className="h-7 w-7 shrink-0 rounded-md" />
              {!sidebarCollapsed && <span className="truncate text-lg font-bold text-brand-400">Settings</span>}
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {!sidebarCollapsed && (
          <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Settings
          </p>
        )}
        {visibleNav.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                isActive
                  ? "border-l-2 border-brand-400 bg-white/5 text-brand-400"
                  : "border-l-2 border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
                sidebarCollapsed && "justify-center px-0"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Back to Home */}
      <div className="border-t border-[#2a2a2a] p-3">
        <Link
          href="/home"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200",
            sidebarCollapsed && "justify-center px-2"
          )}
          title={sidebarCollapsed ? "Home" : undefined}
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
          {!sidebarCollapsed && "Back to Home"}
        </Link>
      </div>

      {/* User footer */}
      {!sidebarCollapsed && (
        <div className="flex items-center gap-3 border-t border-[#2a2a2a] p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
            {currentUser.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">{currentUser.name}</p>
            <p className="truncate text-xs capitalize text-slate-400">{currentUser.role}</p>
          </div>
        </div>
      )}
    </aside>
  );
}
