"use client";

import { useQuickAddStore } from "@/stores/quick-add-store";
import { NewClientDialog } from "@/components/crm/NewClientDialog";
import { NewEstimateDialog } from "@/components/crm/estimates/NewEstimateDialog";
import { NewInvoiceSheet } from "@/components/crm/invoices/NewInvoiceSheet";
import { NewTicketDialog } from "@/components/crm/tickets/TicketsList";
import { NewJobDialog } from "@/components/crm/jobs/NewJobDialog";
import { AddPaymentDialog } from "@/components/crm/payments/PaymentsList";

export function QuickAddOverlay() {
  const { type, close } = useQuickAddStore();

  return (
    <>
      <NewClientDialog open={type === "client"} onOpenChange={(o) => !o && close()} />
      <NewEstimateDialog open={type === "estimate"} onOpenChange={(o) => !o && close()} />
      <NewInvoiceSheet open={type === "invoice"} onClose={close} />
      <NewTicketDialog open={type === "ticket"} onOpenChange={(o) => !o && close()} />
      <NewJobDialog open={type === "job"} onOpenChange={(o) => !o && close()} />
      <AddPaymentDialog open={type === "payment"} onOpenChange={(o) => !o && close()} />
    </>
  );
}
