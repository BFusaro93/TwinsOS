"use client";

import { useState } from "react";
import { CalendarClock, Calculator, Wrench, Gauge } from "lucide-react";
import { BrowserFrame } from "@/components/marketing/mockups/BrowserFrame";
import { DispatchBoardMockup } from "@/components/marketing/mockups/DispatchBoardMockup";
import { EstimatesPipelineMockup } from "@/components/marketing/mockups/EstimatesPipelineMockup";
import { WorkOrderMockup } from "@/components/marketing/mockups/WorkOrderMockup";
import { KpiDashboardMockup } from "@/components/marketing/mockups/KpiDashboardMockup";

const PANELS = [
  {
    key: "dispatch",
    tab: "Dispatch Board",
    icon: CalendarClock,
    blurb: "See every crew, every job, every day — dispatch, reassign, and track variance to budgeted hours in real time.",
    Mockup: DispatchBoardMockup,
  },
  {
    key: "estimates",
    tab: "Estimates",
    icon: Calculator,
    blurb: "Drag deals through Draft → Quote → Sent → Accepted, with weighted pipeline value calculated automatically.",
    Mockup: EstimatesPipelineMockup,
  },
  {
    key: "workorders",
    tab: "Work Orders",
    icon: Wrench,
    blurb: "Full asset history, status flow, and parts/labor tracking on every work order — the Equipt side of the platform.",
    Mockup: WorkOrderMockup,
  },
  {
    key: "kpi",
    tab: "Scorecard",
    icon: Gauge,
    blurb: "One company-wide scorecard rolling up financial, operations, and sales targets — always current, no spreadsheets.",
    Mockup: KpiDashboardMockup,
  },
] as const;

export function ProductShowcase() {
  const [active, setActive] = useState<(typeof PANELS)[number]["key"]>("dispatch");
  const panel = PANELS.find((p) => p.key === active)!;

  return (
    <div id="product-showcase" className="mx-auto max-w-[1160px] px-6 py-24 sm:px-12">
      <div className="mb-10 text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
          See it in action
        </div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          Real screens. Real workflow.
        </h2>
      </div>

      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {PANELS.map((p) => (
          <button
            key={p.key}
            onClick={() => setActive(p.key)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              active === p.key
                ? "border-[#005642] bg-[#005642] text-white"
                : "border-[#e6e6e0] bg-white text-[#5a5a56] hover:border-[#60ab45] hover:text-[#005642]"
            }`}
          >
            <p.icon className="h-4 w-4" />
            {p.tab}
          </button>
        ))}
      </div>

      <p className="mx-auto mb-8 max-w-[560px] text-center text-[14.5px] leading-relaxed text-[#5a5a56]">
        {panel.blurb}
      </p>

      <div key={panel.key} className="mx-auto max-w-[1040px] animate-in fade-in slide-in-from-bottom-2 duration-500">
        <BrowserFrame tabs={["Jobs", "Crews", "Assets", "Billing"]} activeTab="Jobs">
          <panel.Mockup />
        </BrowserFrame>
      </div>
    </div>
  );
}
