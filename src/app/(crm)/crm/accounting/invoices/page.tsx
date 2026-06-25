import { Suspense } from "react";
import { InvoicesList } from "@/components/crm/invoices/InvoicesList";

export default function InvoicesPage() {
  return (
    <div className="flex h-full flex-col">
      <Suspense>
        <InvoicesList />
      </Suspense>
    </div>
  );
}
