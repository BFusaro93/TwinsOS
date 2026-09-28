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
  Gauge,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarCollapsed, useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import { BrandMark } from "./BrandMark";
import { useIsInternalOrg } from "@/lib/hooks/use-internal-org";
import { useHasDrivingScoreAccess } from "@/lib/hooks/use-driving-score-access";
import { useModuleAccess } from "@/lib/hooks/use-module-access";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useDashboards } from "@/lib/hooks/use-report-center";
import type { PlatformModule } from "@/lib/stripe/plans";
import type { LucideIcon } from "lucide-react";

interface ReportsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown on the /dashboards overview card. */
  description?: string;
  hideFromCrew?: boolean;
  internalOnly?: boolean;
  adminOnly?: boolean;
  requiresDrivingScore?: boolean;
  requiresModule?: PlatformModule;
  /** crm_roles permission key required to see this dashboard. Only applies
   *  to logins that have a Landscapt role — admins and role-less logins
   *  (e.g. managers without a linked employee) keep seeing it. */
  permission?: string;
}

export const DASHBOARDS_NAV: ReportsNavItem[] = [
  { label: "Overview",            href: "/dashboards",                 icon: LayoutDashboard },
  { label: "Equipt Dashboard",    href: "/dashboards/equipt",          icon: Wrench,      requiresModule: "equipt",    hideFromCrew: true, permission: "view_dashboard_equipt", description: "Work orders, purchasing & asset management" },
  { label: "Landscapt My Day",    href: "/dashboards/myday",           icon: CalendarCheck, requiresModule: "landscapt", hideFromCrew: true, permission: "view_dashboard_myday", description: "Your daily schedule and tasks" },
  { label: "Reports Dashboard",   href: "/dashboards/landscapt-reports", icon: BarChart2, requiresModule: "landscapt", hideFromCrew: true, permission: "view_dashboard_reports", description: "Landscapt's built-in reporting dashboard" },
  { label: "KPI Scorecard",       href: "/dashboards/kpis",            icon: Gauge,       requiresModule: "landscapt", hideFromCrew: true, permission: "view_dashboard_kpis", description: "Customizable KPIs computed live from Landscapt data" },
  { label: "Twins KPI Scorecard", href: "/dashboards/twins-kpis",      icon: Target,      hideFromCrew: true, internalOnly: true, description: "Legacy scorecard (AvB, QBO, Samsara sources)" },
  { label: "Financial",           href: "/dashboards/financials",      icon: DollarSign,  hideFromCrew: true, internalOnly: true, adminOnly: true, description: "Revenue, expenses & margin" },
  { label: "Labor Efficiency",    href: "/dashboards/avb",             icon: TrendingUp,                      internalOnly: true, description: "Budget vs. actual labor hours" },
  { label: "Driver Safety Scores",href: "/dashboards/safety",          icon: ShieldCheck, requiresDrivingScore: true, permission: "view_dashboard_driver_safety", description: "Samsara driver safety scoring" },
  { label: "Company Report",      href: "/dashboards/crm",             icon: FileText,    requiresModule: "landscapt", hideFromCrew: true, permission: "view_dashboard_company_report", description: "Sales, operations, and A/R computed live from Landscapt data" },
  { label: "Twins CRM Report",     href: "/dashboards/twins-crm-report", icon: FileText,   hideFromCrew: true, internalOnly: true, description: "Legacy Service Autopilot summary" },
  { label: "Social Media",        href: "/dashboards/social-media",    icon: Share2,      hideFromCrew: true, permission: "view_dashboard_social_media", description: "Weekly reach, engagement, followers & leads by platform" },
];

/** Dashboard routes that aren't in the nav but are still reachable by URL
 *  (custom Report Center dashboards and the legacy tool pages mirrored under
 *  /dashboards). Each needs its own view_dashboard_* key. Crew logins reach
 *  custom dashboards through crm_dashboards.visible_to_crew, which the API
 *  enforces (/api/crm/dashboards/[id]), so they're exempt from the role key. */
export const GATED_DASHBOARD_ROUTES: { href: string; permission: string; crewExempt?: boolean }[] = [
  { href: "/dashboards/custom",           permission: "view_dashboard_custom", crewExempt: true },
  { href: "/dashboards/job-costing",      permission: "view_dashboard_job_costing" },
  { href: "/dashboards/estimate-builder", permission: "view_dashboard_estimate_builder" },
  { href: "/dashboards/calculators",      permission: "view_dashboard_calculators" },
];

/** The permission gate (if any) for a /dashboards pathname. */
export function dashboardRouteGate(pathname: string): { permission: string; crewExempt: boolean } | null {
  const matches = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const nav = DASHBOARDS_NAV.find((i) => i.permission && matches(i.href));
  if (nav?.permission) return { permission: nav.permission, crewExempt: false };
  const extra = GATED_DASHBOARD_ROUTES.find((r) => matches(r.href));
  return extra ? { permission: extra.permission, crewExempt: !!extra.crewExempt } : null;
}

/** Role-permission check for a dashboard's `permission` key. Admins always
 *  pass. Everyone else needs an active Landscapt role that has the key —
 *  fail CLOSED: no linked employee, no role, a soft-deleted role, or a
 *  permissions query that failed all mean "no". (PR #173 let role-less
 *  logins through; that left every gated dashboard open to them.) While
 *  permissions load, gated items are hidden. */
export function useDashboardPermission(): {
  canViewDashboard: (permission?: string) => boolean;
  isLoading: boolean;
} {
  const { can, isAdmin, roleId, isLoading } = usePermissions();
  return {
    canViewDashboard: (permission) =>
      !permission || (!isLoading && (isAdmin || (!!roleId && can(permission)))),
    isLoading,
  };
}

/** DASHBOARDS_NAV filtered to what the current user may see. The sidebar and
 *  the /dashboards overview both render from this so they can't drift apart. */
export function useVisibleDashboardsNav(): ReportsNavItem[] {
  const { currentUser } = useCurrentUserStore();
  const isAdmin = currentUser.role === "admin";
  const isCrew = currentUser.role === "crew";
  const { isInternalOrg } = useIsInternalOrg();
  const { allowed: hasDrivingScoreAccess } = useHasDrivingScoreAccess();
  const { allowed: hasEquipt } = useModuleAccess("equipt");
  const { allowed: hasLandscapt } = useModuleAccess("landscapt");
  const { canViewDashboard } = useDashboardPermission();

  return DASHBOARDS_NAV.filter(
    (item) =>
      (!item.adminOnly || isAdmin) &&
      (!item.hideFromCrew || !isCrew) &&
      (!item.internalOnly || isInternalOrg) &&
      (!item.requiresDrivingScore || hasDrivingScoreAccess) &&
      (!item.requiresModule || (item.requiresModule === "equipt" ? hasEquipt : hasLandscapt)) &&
      canViewDashboard(item.permission)
  );
}

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
  const sidebarCollapsed = useSidebarCollapsed();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { currentUser } = useCurrentUserStore();
  const { allowed: hasLandscapt } = useModuleAccess("landscapt");
  const { data: customDashboards = [] } = useDashboards();
  const visibleNav = useVisibleDashboardsNav();
  const { canViewDashboard } = useDashboardPermission();
  const showCustomDashboards =
    hasLandscapt && (currentUser.role === "crew" || canViewDashboard("view_dashboard_custom"));

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
          {visibleNav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                sidebarCollapsed={sidebarCollapsed}
                isActive={isActivePath(item.href)}
              />
            ))}
          {showCustomDashboards &&
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
