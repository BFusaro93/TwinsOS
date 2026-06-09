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
  exact?: boolean;       // when true, only highlight on exact pathname match
  adminOnly?: boolean;   // when true, only visible to users with role "admin"
  hideFromDriver?: boolean; // when true, hidden from users with role "driver"
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, hideFromDriver: true },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Requisitions", href: "/po/requisitions", icon: FileText, hideFromDriver: true },
      { label: "Purchase Orders", href: "/po/orders", icon: ShoppingCart, hideFromDriver: true },
      { label: "Receiving", href: "/po/receiving", icon: Package, hideFromDriver: true },
      { label: "Products", href: "/po/products", icon: BookOpen, hideFromDriver: true },
      { label: "Projects", href: "/po/projects", icon: Briefcase, hideFromDriver: true },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { label: "Work Orders", href: "/cmms/work-orders", icon: ClipboardCheck, hideFromDriver: true },
      { label: "Requests", href: "/cmms/requests", icon: Bell },
      { label: "PM Schedules", href: "/cmms/pm-schedules", icon: CalendarClock, hideFromDriver: true },
      { label: "Vehicles", href: "/cmms/vehicles", icon: Truck, hideFromDriver: true },
      { label: "Assets", href: "/cmms/assets", icon: Cpu, hideFromDriver: true },
      { label: "Parts Inventory", href: "/cmms/parts", icon: Cog, hideFromDriver: true },
      { label: "Meters", href: "/cmms/meters", icon: Gauge, hideFromDriver: true },
      { label: "Automations", href: "/cmms/automations", icon: Zap, hideFromDriver: true },
    ],
  },
  {
    label: "Shared",
    items: [
      { label: "Vendors", href: "/vendors", icon: Building2, hideFromDriver: true },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/settings/users", icon: Users, adminOnly: true, hideFromDriver: true },
      { label: "Reports", href: "/settings/reports", icon: BarChart3, hideFromDriver: true },
      { label: "Settings", href: "/settings", icon: Settings, exact: true, hideFromDriver: true },
      { label: "Support", href: "/settings/support", icon: HelpCircle, hideFromDriver: true },
      { label: "Docs", href: "/docs", icon: Library, hideFromDriver: true },
    ],
  },
];
