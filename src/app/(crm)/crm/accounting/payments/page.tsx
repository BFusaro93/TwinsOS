import { Suspense } from "react";
import { PaymentsList } from "@/components/crm/payments/PaymentsList";

export default function PaymentsPage() {
  return (
    <div className="flex h-full flex-col">
      <Suspense>
        <PaymentsList />
      </Suspense>
    </div>
  );
}
