"use client";

import { Wrench, CalendarClock, Cpu, Boxes, ShoppingCart, Zap, Gauge } from "lucide-react";
import { ShowcaseTabs, type ShowcasePanel } from "@/components/marketing/ShowcaseTabs";
import { WorkOrderMockup } from "@/components/marketing/mockups/WorkOrderMockup";
import { PMScheduleMockup } from "@/components/marketing/mockups/PMScheduleMockup";
import { AssetDetailMockup } from "@/components/marketing/mockups/AssetDetailMockup";
import { PartsInventoryMockup } from "@/components/marketing/mockups/PartsInventoryMockup";
import { PurchasingMockup } from "@/components/marketing/mockups/PurchasingMockup";
import { AutomationsMockup } from "@/components/marketing/mockups/AutomationsMockup";
import { KpiDashboardMockup } from "@/components/marketing/mockups/KpiDashboardMockup";

const PANELS: ShowcasePanel[] = [
  { key: "workorders", tab: "Work Orders", icon: Wrench, blurb: "Full status flow from Open to Done, with parts and labor tracked against every job and rolled up into asset history.", Mockup: WorkOrderMockup },
  { key: "pm", tab: "PM Schedules", icon: CalendarClock, blurb: "Recurring maintenance triggered by calendar interval or by meter reading — overdue and due-soon schedules surface automatically.", Mockup: PMScheduleMockup },
  { key: "assets", tab: "Asset Detail", icon: Cpu, blurb: "Meter readings, upcoming PM, linked parts, and complete service history — everything about one piece of equipment in one place.", Mockup: AssetDetailMockup },
  { key: "parts", tab: "Parts Inventory", icon: Boxes, blurb: "Quantity on hand, reorder points, and how many assets a part is linked to — low stock is flagged before it becomes a problem.", Mockup: PartsInventoryMockup },
  { key: "purchasing", tab: "Purchasing", icon: ShoppingCart, blurb: "Requisitions route through a configurable approval chain before becoming a PO — full visibility from request to receiving.", Mockup: PurchasingMockup },
  { key: "automations", tab: "Automations", icon: Zap, blurb: "Trigger → action rules fire on a meter threshold, a low-stock part, or an upcoming PM — no one has to remember to check.", Mockup: AutomationsMockup },
  { key: "scorecard", tab: "Scorecard", icon: Gauge, blurb: "Operations metrics rolled up into one company-wide scorecard — always current, no spreadsheets.", Mockup: KpiDashboardMockup },
];

export function EquiptShowcase() {
  return (
    <ShowcaseTabs id="equipt-showcase" eyebrow="Real screens" title="Equipt, screen by screen." panels={PANELS} />
  );
}
