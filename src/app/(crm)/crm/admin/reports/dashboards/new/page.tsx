import { Suspense } from "react";
import { DashboardBuilder } from "@/components/crm/reports/report-center/DashboardBuilder";

export default function NewDashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardBuilder />
    </Suspense>
  );
}
