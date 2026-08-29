"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TrendingUp,
  ArrowLeft,
  ShieldCheck,
  DollarSign,
  FileText,
  Target,
  LayoutDashboard,
  Wrench,
  CalendarCheck,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import { BrandMark } from "./BrandMark";
import { useIsInternalOrg } from "@/lib/hooks/use-internal-org";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import { useDashboards } from "@/lib/hooks/use-report-center";
import type { PlatformModule } from "@/lib/stripe/plans";
import type { LucideIcon } from "lucide-react";

interface ReportsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  hideFromCrew?: boolean;
  internalOnly?: boolean;
  requiresModule?: PlatformModule;
}

export const DASHBOARDS_NAV: ReportsNavItem[] = [
  { label: "Overview",            href: "/dashboards",                 icon: LayoutDashboard },
  { label: "Equipt Dashboard",    href: "/dashboards/equipt",          icon: Wrench,      requiresModule: "equipt" },
  { label: "Landscapt My Day",    href: "/dashboards/myday",           icon: CalendarCheck, requiresModule: "landscapt" },
  { label: "Reports Dashboard",   href: "/dashboards/landscapt-reports", icon: BarChart2, requiresModule: "landscapt" },
  { label: "KPI Scorecard",       href: "/dashboards/kpis",            icon: Target,      hideFromCrew: true },
  { label: "Financial",           href: "/dashboards/financials",      icon: DollarSign,  hideFromCrew: true, internalOnly: true },
  { label: "Labor Efficiency",    href: "/dashboards/avb",             icon: TrendingUp,                      internalOnly: true },
  { label: "Driver Safety Scores",href: "/dashboards/safety",          icon: ShieldCheck,                     internalOnly: true },
  { label: "CRM Report",          href: "/dashboards/crm",             icon: FileText,    hideFromCrew: true, internalOnly: true },
];

function NavLink({
  href,
  icon: Icon,
  label,
  sidebarCollapsed,
  isActive,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  sidebarCollapsed: boolean;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
        isActive
          ? "border-l-2 border-brand-400 bg-white/5 text-brand-400"
          : "border-l-2 border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
        sidebarCollapsed && "justify-center px-0"
      )}
      title={sidebarCollapsed ? label : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!sidebarCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

export function ReportsSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUIStore();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { currentUser } = useCurrentUserStore();
  const isAdmin = currentUser.role === "admin";
  const isCrew = currentUser.role === "crew";
  const { isInternalOrg } = useIsInternalOrg();
  const { allowed: hasEquipt } = useModuleAccess("equipt");
  const { allowed: hasLandscapt } = useModuleAccess("landscapt");
  const { data: customDashboards = [] } = useDashboards();

  const hasModule = (module?: PlatformModule) =>
    !module || (module === "equipt" ? hasEquipt : hasLandscapt);

  const isActivePath = (href: string) =>
    pathname === href || (href !== "/dashboards" && pathname.startsWith(href + "/"));

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
              <img
                src={logoDataUrl}
                alt={orgName}
                className="h-7 w-7 shrink-0 rounded-md object-contain"
              />
              {!sidebarCollapsed && (
                <span className="truncate text-lg font-bold text-brand-400">Dashboards</span>
              )}
              {sidebarCollapsed && <span className="sr-only">{orgName}</span>}
            </>
          ) : (
            <>
              <BrandMark variant="reversed" className="h-7 w-7 shrink-0 rounded-md" />
              {!sidebarCollapsed && (
                <span className="truncate text-lg font-bold text-brand-400">Dashboards</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="mb-4">
          {!sidebarCollapsed && (
            <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Dashboards
            </p>
          )}
          {DASHBOARDS_NAV.filter((item) => item.href !== "/dashboards/financials" || isAdmin)
            .filter((item) => !item.hideFromCrew || !isCrew)
            .filter((item) => !item.internalOnly || isInternalOrg)
            .filter((item) => hasModule(item.requiresModule))
            .map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                sidebarCollapsed={sidebarCollapsed}
                isActive={isActivePath(item.href)}
              />
            ))}
          {hasLandscapt &&
            customDashboards.map((dashboard) => (
              <NavLink
                key={dashboard.id}
                href={`/dashboards/custom/${dashboard.id}`}
                icon={LayoutDashboard}
                label={dashboard.name}
                sidebarCollapsed={sidebarCollapsed}
                isActive={isActivePath(`/dashboards/custom/${dashboard.id}`)}
              />
            ))}
        </div>
      </nav>

      {/* Back to CMMS */}
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
