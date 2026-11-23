"use client";

import { useRouter } from "next/navigation";
import { useQuickAddStore } from "@/stores/quick-add-store";
import { NewClientDialog } from "@/components/crm/NewClientDialog";
import { NewEstimateDialog } from "@/components/crm/estimates/NewEstimateDialog";
import { NewInvoiceSheet } from "@/components/crm/invoices/NewInvoiceSheet";
import { NewTicketDialog } from "@/components/crm/tickets/TicketsList";
import { NewJobDialog } from "@/components/crm/jobs/NewJobDialog";
import { AddPaymentDialog } from "@/components/crm/payments/PaymentsList";

export function QuickAddOverlay() {
  const { type, close } = useQuickAddStore();
  const router = useRouter();

  return (
    <>
      <NewClientDialog
        open={type === "client"}
        onOpenChange={(o) => !o && close()}
        // Quick-add can be launched from any page, so go to the new record.
        onCreated={(client) => router.push(`/crm/clients/${client.id}`)}
      />
      <NewEstimateDialog open={type === "estimate"} onOpenChange={(o) => !o && close()} />
      <NewInvoiceSheet open={type === "invoice"} onClose={close} />
      <NewTicketDialog open={type === "ticket"} onOpenChange={(o) => !o && close()} />
      <NewJobDialog open={type === "job"} onOpenChange={(o) => !o && close()} />
      <AddPaymentDialog open={type === "payment"} onOpenChange={(o) => !o && close()} />
    </>
  );
}
