"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Leaf, Calculator, PenLine, DollarSign, ShieldAlert, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import type { LucideIcon } from "lucide-react";

interface ToolsNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  hideFromCrew?: boolean;
}

const TOOLS_NAV: ToolsNavItem[] = [
  { label: "Estimate Builder",  href: "/tools/estimate-builder", icon: PenLine,      description: "Generate estimate text & language",  hideFromCrew: true },
  { label: "Job Costing",       href: "/tools/job-costing",      icon: DollarSign,   description: "Track per-job material costs",        hideFromCrew: true },
  { label: "Damage Cases",      href: "/tools/damage-cases",     icon: ShieldAlert,  description: "Track property damage & warranty",    hideFromCrew: true },
  { label: "Calculators",       href: "/tools/calculators",      icon: FlaskConical, description: "Material quantity calculators" },
];

export function ToolsSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUIStore();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { currentUser } = useCurrentUserStore();
  const isCrew = currentUser.role === "crew";

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
              {!sidebarCollapsed && <span className="truncate text-lg font-bold text-brand-400">Tools</span>}
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500">
                <Leaf className="h-4 w-4 text-white" />
              </div>
              {!sidebarCollapsed && <span className="truncate text-lg font-bold text-brand-400">Tools</span>}
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {!sidebarCollapsed && (
          <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Tools
          </p>
        )}
        {TOOLS_NAV
          .filter((item) => !item.hideFromCrew || !isCrew)
          .map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
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
