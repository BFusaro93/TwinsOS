"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import { useIsInternalOrg } from "@/lib/hooks/use-internal-org";
import { Camera, FileImage, ArrowLeft, Leaf, Briefcase, Wrench, CalendarDays, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PhotoNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  requiresPoAccess?: boolean;
  internalOnly?: boolean;
}

export const PHOTOS_NAV: PhotoNavItem[] = [
  { label: "Job Photos", href: "/photos/jobs",     icon: FileImage },
  { label: "Projects",   href: "/photos/projects", icon: Briefcase, requiresPoAccess: true },
];

export const FIELD_NAV: PhotoNavItem[] = [
  { label: "Morning Checklist",  href: "/photos/field/crew-checklist",  icon: ClipboardList, internalOnly: true },
  { label: "Time Off Request",   href: "/photos/field/time-off",        icon: CalendarDays,  internalOnly: true },
  { label: "Repair Request",     href: "/photos/field/repair-request",  icon: Wrench },
];

// Roles with access to the PO/Projects side (Projects nav item)
const PO_ROLES = new Set(["admin", "manager", "purchaser"]);

export function PhotosSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUIStore();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { currentUser } = useCurrentUserStore();
  const canSeeProjects = PO_ROLES.has(currentUser.role);
  const { isInternalOrg } = useIsInternalOrg();

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
              {!sidebarCollapsed && <span className="truncate text-lg font-bold text-brand-400">Job Photos</span>}
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500">
                <Camera className="h-4 w-4 text-white" />
              </div>
              {!sidebarCollapsed && <span className="truncate text-lg font-bold text-brand-400">Job Photos</span>}
            </>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4">
        {/* Photos section */}
        {!sidebarCollapsed && (
          <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Photos
          </p>
        )}
        {PHOTOS_NAV.filter((item) => !item.requiresPoAccess || canSeeProjects).map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/po/projects" && pathname.startsWith(item.href + "/"));
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
                sidebarCollapsed && "justify-center px-0",
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        {/* Field section */}
        <div className="mt-4">
          {!sidebarCollapsed && (
            <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Field
            </p>
          )}
          {FIELD_NAV.filter((item) => !item.internalOnly || isInternalOrg).map((item) => {
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
                  sidebarCollapsed && "justify-center px-0",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Back to Home */}
      <div className="shrink-0 border-t border-[#2a2a2a] p-3">
        <Link
          href="/home"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white",
            sidebarCollapsed && "justify-center px-2",
          )}
          title={sidebarCollapsed ? "Back to Home" : undefined}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>Back to Home</span>}
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
