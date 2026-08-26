"use client";

import { CalendarClock, Calculator, TrendingUp, Wrench, Gauge, LifeBuoy, Camera } from "lucide-react";
import { ShowcaseTabs, type ShowcasePanel } from "@/components/marketing/ShowcaseTabs";
import { DispatchBoardMockup } from "@/components/marketing/mockups/DispatchBoardMockup";
import { EstimatesPipelineMockup } from "@/components/marketing/mockups/EstimatesPipelineMockup";
import { JobCostingMockup } from "@/components/marketing/mockups/JobCostingMockup";
import { WorkOrderMockup } from "@/components/marketing/mockups/WorkOrderMockup";
import { KpiDashboardMockup } from "@/components/marketing/mockups/KpiDashboardMockup";
import { TicketsMockup } from "@/components/marketing/mockups/TicketsMockup";
import { JobPhotosMockup } from "@/components/marketing/mockups/JobPhotosMockup";

const PANELS: ShowcasePanel[] = [
  { key: "dispatch", tab: "Dispatch Board", icon: CalendarClock, blurb: "See every crew, every job, every day — dispatch, reassign, and track variance to budgeted hours in real time.", Mockup: DispatchBoardMockup },
  { key: "estimates", tab: "Estimates", icon: Calculator, blurb: "Drag deals through Draft → Quote → Sent → Accepted, with weighted pipeline value calculated automatically.", Mockup: EstimatesPipelineMockup },
  { key: "costing", tab: "Job Costing", icon: TrendingUp, blurb: "Every job rolls estimated vs. actual labor, materials, and revenue up into real-time gross profit and margin — no spreadsheet reconciliation after the fact.", Mockup: JobCostingMockup },
  { key: "workorders", tab: "Work Orders", icon: Wrench, blurb: "Full asset history, status flow, and parts/labor tracking on every work order — the Equipt side of the platform.", Mockup: WorkOrderMockup },
  { key: "kpi", tab: "Scorecard", icon: Gauge, blurb: "One company-wide scorecard rolling up financial, operations, and sales targets — always current, no spreadsheets.", Mockup: KpiDashboardMockup },
  { key: "tickets", tab: "Tickets", icon: LifeBuoy, blurb: "Customer support tickets with priority, status, and automated past-due tracking — visible to clients in their own portal.", Mockup: TicketsMockup },
  { key: "photos", tab: "Job Photos", icon: Camera, blurb: "Before/during/after photo capture with on-image annotation, tagging, and an archive attached to every job.", Mockup: JobPhotosMockup },
];

export function FeaturesShowcase() {
  return (
    <ShowcaseTabs id="features-showcase" eyebrow="Real screens" title="Every module, one login." panels={PANELS} />
  );
}
