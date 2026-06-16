import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  BookOpen,
  Briefcase,
  Wrench,
  Bell,
  CalendarClock,
  Truck,
  Cpu,
  Cog,
  Gauge,
  Zap,
  Building2,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  Library,
  ClipboardCheck,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean;       // when true, only highlight on exact pathname match
  adminOnly?: boolean;   // when true, only visible to users with role "admin"
  hideFromCrew?: boolean; // when true, hidden from users with role "crew"
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, hideFromCrew: true, exact: true },
      { label: "Damage Cases", href: "/dashboard/damage-cases", icon: ShieldAlert, hideFromCrew: true },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Requisitions", href: "/po/requisitions", icon: FileText, hideFromCrew: true },
      { label: "Purchase Orders", href: "/po/orders", icon: ShoppingCart, hideFromCrew: true },
      { label: "Receiving", href: "/po/receiving", icon: Package, hideFromCrew: true },
      { label: "Products", href: "/po/products", icon: BookOpen, hideFromCrew: true },
      { label: "Projects", href: "/po/projects", icon: Briefcase, hideFromCrew: true },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { label: "Work Orders", href: "/cmms/work-orders", icon: ClipboardCheck, hideFromCrew: true },
      { label: "Requests", href: "/cmms/requests", icon: Bell },
      { label: "PM Schedules", href: "/cmms/pm-schedules", icon: CalendarClock, hideFromCrew: true },
      { label: "Vehicles", href: "/cmms/vehicles", icon: Truck, hideFromCrew: true },
      { label: "Assets", href: "/cmms/assets", icon: Cpu, hideFromCrew: true },
      { label: "Parts Inventory", href: "/cmms/parts", icon: Cog, hideFromCrew: true },
      { label: "Meters", href: "/cmms/meters", icon: Gauge, hideFromCrew: true },
      { label: "Automations", href: "/cmms/automations", icon: Zap, hideFromCrew: true },
    ],
  },
  {
    label: "Shared",
    items: [
      { label: "Vendors", href: "/vendors", icon: Building2, hideFromCrew: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/settings/users", icon: Users, adminOnly: true, hideFromCrew: true },
      { label: "Reports", href: "/settings/reports", icon: BarChart3, hideFromCrew: true },
      { label: "Settings", href: "/settings", icon: Settings, exact: true, hideFromCrew: true },
      { label: "Support", href: "/settings/support", icon: HelpCircle, hideFromCrew: true },
      { label: "Docs", href: "/docs", icon: Library, hideFromCrew: true },
    ],
  },
];
