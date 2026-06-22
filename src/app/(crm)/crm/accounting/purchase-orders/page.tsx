import { Suspense } from "react";
import { POListPage } from "@/components/po/POListPage";

export default function CRMPurchaseOrdersPage() {
  return (
    <Suspense>
      <POListPage />
    </Suspense>
  );
}
