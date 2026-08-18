import { Suspense } from "react";
import { InvoicesToChargeList } from "@/components/crm/invoices/InvoicesToChargeList";

export default function InvoicesToChargePage() {
  return (
    <div className="flex h-full flex-col">
      <Suspense>
        <InvoicesToChargeList />
      </Suspense>
    </div>
  );
}
