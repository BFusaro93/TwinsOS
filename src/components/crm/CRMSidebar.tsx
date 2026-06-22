"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore, useCurrentUserStore } from "@/stores";
import { useSettingsStore } from "@/stores/settings-store";
import {
  ArrowLeft,
  Leaf,
  LayoutDashboard,
  Users,
  UserRound,
  ClipboardSignature,
  Ticket,
  UserSearch,
  CalendarDays,
  ListOrdered,
  Snowflake,
  FolderKanban,
  Receipt,
  CreditCard,
  ShoppingCart,
  FileSignature,
  FileText,
  Zap,
  FormInput,
  Mail,
  Megaphone,
  HardHat,
  UserCog,
  Building2,
  BarChart3,
  Settings,
  HelpCircle,
  Library,
  ShieldCheck,
  Layers,
  Briefcase,
  Package,
  CalendarClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const CRM_NAV: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "My Day", href: "/crm/home", icon: LayoutDashboard },
    ],
  },
  {
    label: "CRM",
    items: [
      { label: "Clients",   href: "/crm/clients",   icon: UserRound },
      { label: "Leads",     href: "/crm/leads",     icon: UserSearch },
      { label: "Estimates",  href: "/crm/estimates",           icon: ClipboardSignature },
      { label: "Tickets",   href: "/crm/tickets",   icon: Ticket },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { label: "Jobs",           href: "/crm/scheduling",              icon: Briefcase },
      { label: "Dispatch Board", href: "/crm/scheduling/dispatch",     icon: CalendarDays },
      { label: "Waiting List",   href: "/crm/scheduling/waiting-list", icon: ListOrdered },
      { label: "Snow Jobs",      href: "/crm/scheduling/snow",         icon: Snowflake,     comingSoon: true },
      { label: "Projects",       href: "/crm/scheduling/projects",     icon: FolderKanban },
    ],
  },
  {
    label: "Accounting",
    items: [
      { label: "Invoices",        href: "/crm/accounting/invoices",        icon: Receipt },
      { label: "Payments",        href: "/crm/accounting/payments",        icon: CreditCard },
      { label: "Purchase Orders", href: "/crm/accounting/purchase-orders", icon: ShoppingCart },
      { label: "Contracts",       href: "/crm/accounting/contracts",       icon: FileSignature },
      { label: "Snow Invoicing",  href: "/crm/accounting/snow-invoicing",  icon: FileText,      comingSoon: true },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Automations",     href: "/crm/communication/automations",  icon: Zap,          comingSoon: true },
      { label: "Forms",           href: "/crm/communication/forms",        icon: FormInput,     comingSoon: true },
      { label: "Email Activity",  href: "/crm/communication/email",        icon: Mail,          comingSoon: true },
      { label: "Sales Campaigns", href: "/crm/communication/campaigns",    icon: Megaphone,     comingSoon: true },
    ],
  },
  {
    label: "Team",
    items: [
      { label: "Crews",     href: "/crm/team/crews",     icon: HardHat },
      { label: "Employees", href: "/crm/team/employees", icon: UserCog },
      { label: "Vendors",   href: "/crm/vendors",        icon: Building2 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Reports",  href: "/crm/admin/reports",  icon: BarChart3, comingSoon: true },
      { label: "Services",   href: "/crm/settings/services",   icon: Layers },
      { label: "Schedules",  href: "/crm/settings/schedules",  icon: CalendarClock },
      { label: "Packages",   href: "/crm/settings/packages",   icon: Package },
      { label: "Settings", href: "/crm/settings",        icon: Settings },
      { label: "Support",           href: "/crm/admin/support",             icon: HelpCircle, comingSoon: true },
      { label: "Docs",              href: "/docs",                          icon: Library },
    ],
  },
];

export function CRMSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed } = useUIStore();
  const { logoDataUrl, orgName } = useSettingsStore();
  const { currentUser } = useCurrentUserStore();

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-[#1e1e1e] transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center border-b border-[#2a2a2a] px-4">
        <div className="flex min-w-0 items-center gap-2">
          {logoDataUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoDataUrl} alt={orgName} className="h-7 w-7 shrink-0 rounded-md object-contain" />
              {!sidebarCollapsed && (
                <span className="truncate text-lg font-bold text-brand-400">CRM</span>
              )}
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-500">
                <Leaf className="h-4 w-4 text-white" />
              </div>
              {!sidebarCollapsed && (
                <span className="truncate text-lg font-bold text-brand-400">CRM</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        {CRM_NAV.map((section) => (
          <div key={section.label} className="mb-3">
            {!sidebarCollapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {section.label}
              </p>
            )}
            {section.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/crm/home" &&
                  item.href !== "/vendors" &&
                  item.href !== "/docs" &&
                  pathname.startsWith(item.href + "/"));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.comingSoon ? "#" : item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-1.5 text-sm transition-colors",
                    isActive
                      ? "border-l-2 border-brand-400 bg-white/5 text-brand-400"
                      : item.comingSoon
                      ? "border-l-2 border-transparent text-slate-600 cursor-default"
                      : "border-l-2 border-transparent text-slate-300 hover:bg-white/5 hover:text-white",
                    sidebarCollapsed && "justify-center px-0"
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={item.comingSoon ? (e) => e.preventDefault() : undefined}
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
