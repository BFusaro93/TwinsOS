"use client";

import { CalendarClock, Calculator, TrendingUp, FileStack, Users, Camera } from "lucide-react";
import { ShowcaseTabs, type ShowcasePanel } from "@/components/marketing/ShowcaseTabs";
import { DispatchBoardMockup } from "@/components/marketing/mockups/DispatchBoardMockup";
import { EstimatesPipelineMockup } from "@/components/marketing/mockups/EstimatesPipelineMockup";
import { JobCostingMockup } from "@/components/marketing/mockups/JobCostingMockup";
import { ContractsMockup } from "@/components/marketing/mockups/ContractsMockup";
import { ClientPortalMockup } from "@/components/marketing/mockups/ClientPortalMockup";
import { JobPhotosMockup } from "@/components/marketing/mockups/JobPhotosMockup";

const PANELS: ShowcasePanel[] = [
  { key: "dispatch", tab: "Dispatch Board", icon: CalendarClock, blurb: "See every crew, every job, every day — dispatch, reassign, and track variance to budgeted hours in real time.", Mockup: DispatchBoardMockup },
  { key: "estimates", tab: "Estimates", icon: Calculator, blurb: "Drag deals through Draft → Quote → Sent → Accepted, with weighted pipeline value calculated automatically.", Mockup: EstimatesPipelineMockup },
  { key: "costing", tab: "Job Costing", icon: TrendingUp, blurb: "Every job rolls estimated vs. actual labor, materials, and revenue up into real-time gross profit and margin.", Mockup: JobCostingMockup },
  { key: "contracts", tab: "Contracts & Packages", icon: FileStack, blurb: "Recurring service agreements and bundled programs — like a 7-Step Fert plan — billed automatically, with visit usage tracked per package.", Mockup: ContractsMockup },
  { key: "portal", tab: "Client Portal", icon: Users, blurb: "Clients pay invoices, accept or push back on estimates, and check job status themselves — without a phone call.", Mockup: ClientPortalMockup },
  { key: "photos", tab: "Job Photos", icon: Camera, blurb: "Before/during/after photo capture with on-image annotation, tagging, and an archive attached to every job.", Mockup: JobPhotosMockup },
];

export function LandscaptShowcase() {
  return (
    <ShowcaseTabs id="landscapt-showcase" eyebrow="Real screens" title="Landscapt, screen by screen." panels={PANELS} />
  );
}
