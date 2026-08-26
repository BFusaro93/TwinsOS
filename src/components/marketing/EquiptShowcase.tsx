"use client";

import { Wrench, Cpu, ShoppingCart, Gauge } from "lucide-react";
import { ShowcaseTabs, type ShowcasePanel } from "@/components/marketing/ShowcaseTabs";
import { WorkOrderMockup } from "@/components/marketing/mockups/WorkOrderMockup";
import { AssetDetailMockup } from "@/components/marketing/mockups/AssetDetailMockup";
import { PurchasingMockup } from "@/components/marketing/mockups/PurchasingMockup";
import { KpiDashboardMockup } from "@/components/marketing/mockups/KpiDashboardMockup";

const PANELS: ShowcasePanel[] = [
  { key: "workorders", tab: "Work Orders", icon: Wrench, blurb: "Full status flow from Open to Done, with parts and labor tracked against every job and rolled up into asset history.", Mockup: WorkOrderMockup },
  { key: "assets", tab: "Asset Detail", icon: Cpu, blurb: "Meter readings, upcoming PM, linked parts, and complete service history — everything about one piece of equipment in one place.", Mockup: AssetDetailMockup },
  { key: "purchasing", tab: "Purchasing", icon: ShoppingCart, blurb: "Requisitions route through a configurable approval chain before becoming a PO — full visibility from request to receiving.", Mockup: PurchasingMockup },
  { key: "scorecard", tab: "Scorecard", icon: Gauge, blurb: "Operations metrics rolled up into one company-wide scorecard — always current, no spreadsheets.", Mockup: KpiDashboardMockup },
];

export function EquiptShowcase() {
  return (
    <ShowcaseTabs id="equipt-showcase" eyebrow="Real screens" title="Equipt, screen by screen." panels={PANELS} />
  );
}
