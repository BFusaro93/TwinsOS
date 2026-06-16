import { Suspense } from "react";
import { WorkOrderListPage } from "@/components/cmms/WorkOrderListPage";

export default function WorkOrdersPage() {
  return (
    <Suspense>
      <WorkOrderListPage />
    </Suspense>
  );
}
