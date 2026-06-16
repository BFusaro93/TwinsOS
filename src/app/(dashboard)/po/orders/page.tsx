import { Suspense } from "react";
import { POListPage } from "@/components/po/POListPage";

export default function PurchaseOrdersPage() {
  return (
    <Suspense>
      <POListPage />
    </Suspense>
  );
}
