import { CheckCircle2, MessageSquareText, FileSignature, Mail } from "lucide-react";

const RULES = [
  {
    icon: CheckCircle2,
    trigger: "Job marked complete",
    action: "Send follow-up email — 24h later",
    scope: "All recurring jobs",
    enabled: true,
  },
  {
    icon: FileSignature,
    trigger: "Estimate sent",
    action: "Text reminder if not viewed in 48h",
    scope: "All estimates",
    enabled: true,
  },
  {
    icon: Mail,
    trigger: "Invoice 7 days past due",
    action: "Send past-due notice + late fee flag",
    scope: "All invoices",
    enabled: true,
  },
  {
    icon: MessageSquareText,
    trigger: "New ticket submitted",
    action: "Notify assigned account manager",
    scope: "Client Portal",
    enabled: false,
  },
];

export function CRMAutomationsMockup() {
  return (
    <div className="p-4 text-left">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-[#0a0a0a]">Automations</div>
        <span className="text-[10.5px] text-slate-400">3 enabled &middot; unlimited rules</span>
      </div>
      <div className="flex flex-col gap-2">
        {RULES.map((r) => (
          <div
            key={r.trigger}
            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#eef4e2]">
              <r.icon className="h-4 w-4 text-[#60ab45]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-slate-700">
                {r.trigger} <span className="font-normal text-slate-400">&rarr;</span> {r.action}
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
