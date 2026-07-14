import { Suspense } from "react";
import { ReportsHub } from "@/components/crm/reports/report-center/ReportsHub";

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <ReportsHub />
    </Suspense>
  );
}
