import { Gauge, Boxes, CalendarClock } from "lucide-react";

const RULES = [
  {
    icon: Gauge,
    trigger: "Meter reaches 36,000 mi",
    action: "Create Work Order — Oil Change",
    scope: "F-250 Service Truck — Unit 3",
    enabled: true,
  },
  {
    icon: Boxes,
    trigger: "Part quantity falls below reorder point",
    action: "Create Purchase Requisition",
    scope: "All parts",
    enabled: true,
  },
  {
    icon: CalendarClock,
    trigger: "PM Schedule due in 3 days",
    action: "Send notification to assigned technician",
    scope: "All assets",
    enabled: true,
  },
  {
    icon: Gauge,
    trigger: "Work order marked overdue",
    action: "Escalate — notify manager",
    scope: "Maintenance",
    enabled: false,
  },
];

export function AutomationsMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Automations</div>
        <span className="text-[10.5px] text-slate-400">3 of 4 active</span>
      </div>
      <div className="flex flex-col gap-2">
        {RULES.map((r) => (
          <div
            key={r.trigger}
            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#e6f5fb]">
              <r.icon className="h-4 w-4 text-[#2aa9e0]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-slate-700">
                {r.trigger} <span className="font-normal text-slate-400">→</span> {r.action}
              </div>
              <div className="text-[9.5px] text-slate-400">{r.scope}</div>
            </div>
            <div
              className={`flex h-[18px] w-8 shrink-0 items-center rounded-full px-0.5 ${
                r.enabled ? "justify-end bg-[#60ab45]" : "justify-start bg-slate-200"
              }`}
            >
              <div className="h-3.5 w-3.5 rounded-full bg-white shadow" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
