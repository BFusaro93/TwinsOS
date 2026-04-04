"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, ArrowLeft, Leaf, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import type { LucideIcon } from "lucide-react";

interface ReportsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface ReportsNavSection {
  label: string;
  items: ReportsNavItem[];
}

const REPORTS_NAV: ReportsNavSection[] = [
  {
    label: "Dashboards",
    items: [
      { label: "AvB × Gusto Hours", href: "/dashboards/avb", icon: TrendingUp },
      { label: "Driver Safety Scores", href: "/dashboards/safety", icon: ShieldCheck },
    ],
  },
];

export function ReportsSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUIStore();
  const { logoDataUrl, orgName } = useSettingsStore();

  return (
    <aside
      className={cn(
        "flex h-screen flex-col bg-[#1e1e1e] transition-all duration-200",
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
                className={cn(
                  "object-contain",
                  sidebarCollapsed ? "h-7 w-7" : "h-8 max-w-[160px]"
                )}
              />
              {sidebarCollapsed && <span className="sr-only">{orgName}</span>}
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500">
                <Leaf className="h-4 w-4 text-white" />
              </div>
              {!sidebarCollapsed && (
                <span className="truncate text-lg font-bold text-brand-400">TwinsOS</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {REPORTS_NAV.map((section) => (
          <div key={section.label} className="mb-4">
            {!sidebarCollapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + "/");
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
                  {!sidebarCollapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
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
            BF
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-200">Brandon Fusaro</p>
            <p className="truncate text-xs text-slate-400">Admin</p>
          </div>
        </div>
      )}
    </aside>
  );
}
