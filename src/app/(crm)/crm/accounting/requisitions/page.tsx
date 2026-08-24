import { Suspense } from "react";
import { RequisitionListPage } from "@/components/po/RequisitionListPage";

export default function CRMRequisitionsPage() {
  return (
    <Suspense>
      <RequisitionListPage />
    </Suspense>
  );
}
