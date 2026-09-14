"use client";

import { MilestoneScheduleEditor } from "@/components/crm/billing/MilestoneScheduleEditor";

/**
 * The estimate-side view of a billing schedule. Projects render the same rows
 * through the same component — see MilestoneScheduleEditor — so a milestone
 * invoiced from a project shows as Invoiced here too, without any copying.
 */
export function EstimateMilestonesEditor({
  estimateId,
  clientId,
  salesRepId,
  totalCents,
}: {
  estimateId: string;
  clientId: string;
  salesRepId: string | null;
  totalCents: number;
}) {
  return (
    <MilestoneScheduleEditor
      estimateId={estimateId}
      clientId={clientId}
      salesRepId={salesRepId}
      totalCents={totalCents}
      basisLabel="estimate"
    />
  );
}
