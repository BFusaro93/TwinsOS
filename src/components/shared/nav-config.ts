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
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact?: boolean; // when true, only highlight on exact pathname match
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Requisitions", href: "/po/requisitions", icon: FileText },
      { label: "Purchase Orders", href: "/po/orders", icon: ShoppingCart },
      { label: "Receiving", href: "/po/receiving", icon: Package },
      { label: "Products", href: "/po/products", icon: BookOpen },
      { label: "Projects", href: "/po/projects", icon: Briefcase },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { label: "Work Orders", href: "/cmms/work-orders", icon: ClipboardCheck },
      { label: "Requests", href: "/cmms/requests", icon: Bell },
      { label: "PM Schedules", href: "/cmms/pm-schedules", icon: CalendarClock },
      { label: "Vehicles", href: "/cmms/vehicles", icon: Truck },
      { label: "Assets", href: "/cmms/assets", icon: Cpu },
      { label: "Parts Inventory", href: "/cmms/parts", icon: Cog },
      { label: "Meters", href: "/cmms/meters", icon: Gauge },
      { label: "Automations", href: "/cmms/automations", icon: Zap },
    ],
  },
  {
    label: "Shared",
    items: [
      { label: "Vendors", href: "/vendors", icon: Building2 },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/settings/users", icon: Users },
{ label: "Reports", href: "/settings/reports", icon: BarChart3 },
      { label: "Settings", href: "/settings", icon: Settings, exact: true },
      { label: "Support", href: "/settings/support", icon: HelpCircle },
      { label: "Docs", href: "/docs", icon: Library },
    ],
  },
];
