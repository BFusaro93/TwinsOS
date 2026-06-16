import { Suspense } from "react";
import { RequisitionListPage } from "@/components/po/RequisitionListPage";

export default function RequisitionsPage() {
  return (
    <Suspense>
      <RequisitionListPage />
    </Suspense>
  );
}
