import {
  Truck,
  Users,
  DollarSign,
  BarChart2,
  Wrench,
  Calendar,
  Phone,
  Mail,
  Globe,
  CreditCard,
  Shield,
  Cloud,
  Package,
  ClipboardList,
  FileText,
  Building2,
  MapPin,
  Link2,
  Briefcase,
  Fuel,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Home-page "external app shortcut" tiles (e.g. Samsara, Gusto) are stored per-org
// in organizations.customizations.homeShortcuts — no dedicated table needed for a
// small, ordered list like this. Icons are a fixed set so we can persist a stable
// string key instead of an icon component.

export interface HomeShortcut {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  url: string;
}

export const HOME_SHORTCUT_ICONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "Truck", label: "Truck", icon: Truck },
  { key: "Users", label: "People", icon: Users },
  { key: "DollarSign", label: "Dollar Sign", icon: DollarSign },
  { key: "BarChart2", label: "Chart", icon: BarChart2 },
  { key: "Wrench", label: "Wrench", icon: Wrench },
  { key: "Calendar", label: "Calendar", icon: Calendar },
  { key: "Phone", label: "Phone", icon: Phone },
  { key: "Mail", label: "Mail", icon: Mail },
  { key: "Globe", label: "Globe", icon: Globe },
  { key: "CreditCard", label: "Credit Card", icon: CreditCard },
  { key: "Shield", label: "Shield", icon: Shield },
  { key: "Cloud", label: "Cloud", icon: Cloud },
  { key: "Package", label: "Package", icon: Package },
  { key: "ClipboardList", label: "Clipboard", icon: ClipboardList },
  { key: "FileText", label: "Document", icon: FileText },
  { key: "Building2", label: "Building", icon: Building2 },
  { key: "MapPin", label: "Map Pin", icon: MapPin },
  { key: "Link2", label: "Link", icon: Link2 },
  { key: "Briefcase", label: "Briefcase", icon: Briefcase },
  { key: "Fuel", label: "Fuel", icon: Fuel },
];

const ICON_BY_KEY = new Map(HOME_SHORTCUT_ICONS.map((o) => [o.key, o.icon]));

export function getHomeShortcutIcon(key: string): LucideIcon {
  return ICON_BY_KEY.get(key) ?? Link2;
}

export function parseHomeShortcuts(customizations: Record<string, unknown> | undefined | null): HomeShortcut[] {
  const raw = customizations?.homeShortcuts;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is HomeShortcut =>
      !!item &&
      typeof item === "object" &&
      typeof (item as HomeShortcut).id === "string" &&
      typeof (item as HomeShortcut).name === "string" &&
      typeof (item as HomeShortcut).url === "string"
  );
}
