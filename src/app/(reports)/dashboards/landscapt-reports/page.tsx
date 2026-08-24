"use client";

import { ModuleAccessGuard } from "@/components/shared/ModuleAccessGuard";
import { CRMReports } from "@/components/crm/reports/CRMReports";

export default function LandscaptReportsDashboardPage() {
  return (
    <ModuleAccessGuard module="landscapt">
      <CRMReports hideHeader />
    </ModuleAccessGuard>
  );
}
