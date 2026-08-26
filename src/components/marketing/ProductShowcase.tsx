"use client";

import { CalendarClock, Calculator, Wrench, Gauge } from "lucide-react";
import { ShowcaseTabs, type ShowcasePanel } from "@/components/marketing/ShowcaseTabs";
import { DispatchBoardMockup } from "@/components/marketing/mockups/DispatchBoardMockup";
import { EstimatesPipelineMockup } from "@/components/marketing/mockups/EstimatesPipelineMockup";
import { WorkOrderMockup } from "@/components/marketing/mockups/WorkOrderMockup";
import { KpiDashboardMockup } from "@/components/marketing/mockups/KpiDashboardMockup";

const PANELS: ShowcasePanel[] = [
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
];

export function ProductShowcase() {
  return (
    <ShowcaseTabs id="product-showcase" eyebrow="See it in action" title="Real screens. Real workflow." panels={PANELS} />
  );
}
