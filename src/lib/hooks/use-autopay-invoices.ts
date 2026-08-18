import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AutopayInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  balanceCents: number;
  clientId: string;
  clientName: string;
  savedPaymentMethodType: "card" | "us_bank_account";
  savedPaymentMethodSummary: string | null;
}

/** Invoices belonging to clients with a saved payment method on file, split by which
 * method that is — mirrors Service Autopilot's "Invoices to Charge" / "ACH Invoices to
 * Charge" tabs. Any open, unpaid invoice for such a client shows up here regardless of
 * how it was created; staff (or eventually a scheduled job) charge it from this queue. */
export function useAutopayInvoices(paymentMethod: "card" | "us_bank_account") {
  return useQuery({
    queryKey: ["autopay-invoices", paymentMethod],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("crm_invoices")
        .select(
          "id, invoice_number, invoice_date, balance_cents, client_id, clients:client_id!inner(display_name, saved_payment_method_type, saved_payment_method_summary)"
        )
        .is("deleted_at", null)
        .gt("balance_cents", 0)
        .not("status", "in", "(draft,paid,void)")
        .eq("clients.saved_payment_method_type", paymentMethod)
        .order("invoice_date", { ascending: true })
        .limit(500);
      if (error) throw error;

      type Row = {
        id: string;
        invoice_number: string;
        invoice_date: string | null;
        balance_cents: number;
        client_id: string;
        clients: {
          display_name: string;
          saved_payment_method_type: string | null;
          saved_payment_method_summary: string | null;
        } | null;
      };

      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        invoiceDate: r.invoice_date,
        balanceCents: r.balance_cents,
        clientId: r.client_id,
        clientName: r.clients?.display_name ?? "(unknown)",
        savedPaymentMethodType: (r.clients?.saved_payment_method_type ?? paymentMethod) as "card" | "us_bank_account",
        savedPaymentMethodSummary: r.clients?.saved_payment_method_summary ?? null,
      })) satisfies AutopayInvoice[];
    },
  });
}

export interface ChargeAutopayInvoiceResult {
  status: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

export function useChargeAutopayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId }: { invoiceId: string }) => {
      const res = await fetch("/api/crm/payments/autopay/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to charge invoice");
      return body as ChargeAutopayInvoiceResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["autopay-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
