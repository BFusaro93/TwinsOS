import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  AR_WRITE_OFF_METHOD,
  ISSUED_INVOICE_STATUSES,
  buildResult,
  col,
} from "@/lib/reports/helpers";

// ============================================================
// Receivables section — pre-built reports.
// ============================================================

export const RECEIVABLES_REPORTS: PrebuiltReportDef[] = [
  {
    key: "ar-aging",
    section: "receivables",
    name: "A/R Aging Report",
    description:
      "Buckets each client's open invoice balances by how many days past due they are.",
    filters: [],
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("crm_invoices")
        .select("due_date, invoice_date, balance_cents, clients:client_id(display_name)")
        .gt("balance_cents", 0)
        .is("deleted_at", null)
        .in("status", ISSUED_INVOICE_STATUSES)
        .limit(5000);
      if (error) throw new Error(error.message);

      type Row = {
        due_date: string | null;
        invoice_date: string | null;
        balance_cents: number | null;
        clients: { display_name: string | null } | null;
      };

      interface Buckets {
        current_cents: number;
        d1_30_cents: number;
        d31_60_cents: number;
        d61_90_cents: number;
        d90_plus_cents: number;
        total_cents: number;
      }
      const byClient = new Map<string, Buckets>();
      const now = Date.now();

      for (const r of (data ?? []) as unknown as Row[]) {
        const clientName = r.clients?.display_name ?? "(unknown)";
        const buckets =
          byClient.get(clientName) ?? {
            current_cents: 0,
            d1_30_cents: 0,
            d31_60_cents: 0,
            d61_90_cents: 0,
            d90_plus_cents: 0,
            total_cents: 0,
          };
        const balance = r.balance_cents ?? 0;
        const anchor = r.due_date ?? r.invoice_date;
        const daysPastDue = anchor
          ? Math.floor((now - new Date(anchor).getTime()) / 86400000)
          : 0;
        if (daysPastDue <= 0) buckets.current_cents += balance;
        else if (daysPastDue <= 30) buckets.d1_30_cents += balance;
        else if (daysPastDue <= 60) buckets.d31_60_cents += balance;
        else if (daysPastDue <= 90) buckets.d61_90_cents += balance;
        else buckets.d90_plus_cents += balance;
        buckets.total_cents += balance;
        byClient.set(clientName, buckets);
      }

      const rows = [...byClient.entries()]
        .sort((a, b) => b[1].total_cents - a[1].total_cents)
        .map(([client_name, buckets]) => ({ client_name, ...buckets }));

      return buildResult(
        [
          col("client_name", "Client"),
          col("current_cents", "Current", "money"),
          col("d1_30_cents", "1-30 Days", "money"),
          col("d31_60_cents", "31-60 Days", "money"),
          col("d61_90_cents", "61-90 Days", "money"),
          col("d90_plus_cents", "90+ Days", "money"),
          col("total_cents", "Total", "money"),
        ],
        rows,
        [
          "Reflects invoices open today — not a point-in-time snapshot.",
          "Excludes draft and void invoices — only issued invoices are receivables.",
        ]
      );
    },
  },
  {
    key: "ar-aging-snapshot",
    section: "receivables",
    name: "A/R Aging Snapshot",
    description:
      "Shows each client's outstanding balance alongside their most recent invoice and payment.",
    filters: [
      {
        key: "min_balance",
        label: "Where Balance Greater Than ($)",
        type: "number",
        defaultValue: "0",
      },
    ],
    run: async ({ supabase, params }) => {
      const minCents = Math.round(parseFloat(params.min_balance || "0") * 100);
      const { data, error } = await supabase
        .from("clients")
        .select("id, display_name, balance_outstanding_cents")
        .gt("balance_outstanding_cents", minCents)
        .neq("status", "lead")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      type ClientRow = {
        id: string;
        display_name: string | null;
        balance_outstanding_cents: number | null;
      };
      const clients = (data ?? []) as unknown as ClientRow[];

      const { data: invData, error: invError } = await supabase
        .from("crm_invoices")
        .select("client_id, invoice_date, total_cents")
        .is("deleted_at", null)
        .in("status", ISSUED_INVOICE_STATUSES)
        .order("invoice_date", { ascending: false })
        .limit(5000);
      if (invError) throw new Error(invError.message);

      const { data: payData, error: payError } = await supabase
        .from("crm_payments")
        .select("client_id, payment_date, amount_cents")
        .is("deleted_at", null)
        .eq("is_credit", false)
        .neq("method", AR_WRITE_OFF_METHOD)
        .order("payment_date", { ascending: false })
        .limit(5000);
      if (payError) throw new Error(payError.message);

      type InvoiceRow = {
        client_id: string | null;
        invoice_date: string | null;
        total_cents: number | null;
      };
      type PaymentRow = {
        client_id: string | null;
        payment_date: string | null;
        amount_cents: number | null;
      };

      const lastInvoiceByClient = new Map<string, InvoiceRow>();
      for (const inv of (invData ?? []) as unknown as InvoiceRow[]) {
        if (inv.client_id && !lastInvoiceByClient.has(inv.client_id)) {
          lastInvoiceByClient.set(inv.client_id, inv);
        }
      }
      const lastPaymentByClient = new Map<string, PaymentRow>();
      for (const pay of (payData ?? []) as unknown as PaymentRow[]) {
        if (pay.client_id && !lastPaymentByClient.has(pay.client_id)) {
          lastPaymentByClient.set(pay.client_id, pay);
        }
      }

      const rows = clients
        .map((c) => {
          const lastInvoice = lastInvoiceByClient.get(c.id);
          const lastPayment = lastPaymentByClient.get(c.id);
          return {
            client_name: c.display_name ?? "",
            balance_cents: c.balance_outstanding_cents ?? 0,
            last_invoice_date: lastInvoice?.invoice_date ?? null,
            last_invoice_cents: lastInvoice?.total_cents ?? null,
            last_payment_date: lastPayment?.payment_date ?? null,
            last_payment_cents: lastPayment?.amount_cents ?? null,
          };
        })
        .sort((a, b) => b.balance_cents - a.balance_cents);

      return buildResult(
        [
          col("client_name", "Client"),
          col("balance_cents", "Balance", "money"),
          col("last_invoice_date", "Last Invoice Date", "date"),
          col("last_invoice_cents", "Last Invoice Amount", "money", false),
          col("last_payment_date", "Last Payment Date", "date"),
          col("last_payment_cents", "Last Payment Amount", "money", false),
        ],
        rows,
        [
          "Last Invoice excludes draft and void invoices. Last Payment is cash only — excludes account credits and AR write-offs.",
        ]
      );
    },
  },
];
