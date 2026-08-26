import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  ClipboardCheck,
  CalendarClock,
  Cpu,
  Gauge,
  Zap,
  Building2,
  BarChart3,
  Settings,
} from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";

const SECTIONS = [
  {
    label: "Overview",
    items: [{ icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Purchasing",
    items: [
      { icon: FileText, label: "Requisitions" },
      { icon: ShoppingCart, label: "Purchase Orders" },
      { icon: Package, label: "Products" },
    ],
  },
  {
    label: "Maintenance",
    items: [
      { icon: ClipboardCheck, label: "Work Orders", active: true },
      { icon: CalendarClock, label: "PM Schedules" },
      { icon: Cpu, label: "Assets" },
      { icon: Gauge, label: "Meters" },
      { icon: Zap, label: "Automations" },
    ],
  },
  {
    label: "Shared",
    items: [{ icon: Building2, label: "Vendors" }],
  },
  {
    label: "Administration",
    items: [
      { icon: BarChart3, label: "Reports" },
      { icon: Settings, label: "Settings" },
    ],
  },
];

export function SidebarMockup() {
  return (
    <div className="flex h-[420px] text-left">
      <div className="flex w-[220px] shrink-0 flex-col bg-[#1e1e1e] py-4">
        <div className="mb-4 flex items-center gap-2 px-4">
          <BrandMark variant="reversed" className="h-6 w-6 rounded-md" />
          <span className="text-[13px] font-bold text-brand-400">Equipt</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {SECTIONS.map((section) => (
            <div key={section.label} className="mb-3">
              <div className="px-4 pb-1 text-[9px] font-semibold uppercase tracking-widest text-slate-500">
                {section.label}
              </div>
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className={`mx-2 flex items-center gap-2 rounded px-2.5 py-1.5 text-[11.5px] ${
                    item.active
                      ? "border-l-2 border-brand-400 bg-white/5 font-medium text-brand-400"
                      : "border-l-2 border-transparent text-slate-300"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-white/10 px-4 pt-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">
            DR
          </div>
          <div>
            <div className="text-[10.5px] font-medium text-white">D. Reyes</div>
            <div className="text-[9px] text-slate-500">Technician</div>
          </div>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <div className="mb-1 text-[12px] font-semibold text-slate-500">Work Orders</div>
          <div className="text-[11px] text-slate-400">Everything for the office, one click away.</div>
        </div>
      </div>
    </div>
  );
}
