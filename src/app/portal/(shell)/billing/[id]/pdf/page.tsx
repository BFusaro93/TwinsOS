import { redirect, notFound } from "next/navigation";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";
import PrintButton from "@/components/portal/PrintButton";

interface InvoiceRow {
  id: string;
  invoice_number: number;
  total_cents: number;
  balance_cents: number;
  amount_paid_cents: number;
  due_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

interface InvoiceLineItem {
  id: string;
  description: string | null;
  name: string | null;
  qty: number;
  rate_cents: number;
  total_cents: number;
}

function fmt(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function InvoicePdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getPortalContext();
  if (!ctx) redirect("/portal/login");

  const supabase = createServiceClient();

  const [invoiceRes, clientRes, settingsRes, orgRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("crm_invoices")
      .select("id, invoice_number, total_cents, balance_cents, amount_paid_cents, due_date, status, created_at, updated_at, notes")
      .eq("id", id)
      .eq("client_id", ctx.clientId)
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null)
      .single() as Promise<{ data: InvoiceRow | null }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("clients")
      .select("display_name, billing_address, billing_city, billing_state, billing_zip")
      .eq("id", ctx.clientId)
      .single() as Promise<{ data: { display_name: string | null; billing_address: string | null; billing_city: string | null; billing_state: string | null; billing_zip: string | null } | null }>,

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("client_portal_settings")
      .select("company_name, support_email, support_phone, accent_color")
      .eq("org_id", ctx.orgId)
      .single() as Promise<{ data: { company_name: string | null; support_email: string | null; support_phone: string | null; accent_color: string } | null }>,

    supabase
      .from("organizations")
      .select("name, brand_color")
      .eq("id", ctx.orgId)
      .single(),
  ]);

  const invoice = invoiceRes.data;
  if (!invoice) notFound();

  const client = clientRes.data;
  const settings = settingsRes.data;
  const org = orgRes.data;

  // Try to fetch invoice line items
  const { data: lineItems } = await supabase
    .from("crm_invoice_line_items")
    .select("id, description, name, qty, rate_cents, total_cents")
    .eq("invoice_id", id)
    .order("sort_order", { ascending: true }) as { data: InvoiceLineItem[] | null };

  const accent = settings?.accent_color ?? org?.brand_color ?? "#60ab45";
  const companyName = settings?.company_name ?? org?.name ?? "Your Service Provider";
  const isPaid = invoice.status === "paid";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 0.75in; }
        }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      `}</style>

      <PrintButton accent={accent} backHref="/portal/billing" />

      <div className="max-w-2xl mx-auto py-8 px-4 print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div
              className="h-10 w-10 rounded-lg text-white text-lg font-bold flex items-center justify-center mb-2"
              style={{ backgroundColor: accent }}
            >
              {companyName.charAt(0)}
            </div>
            <h1 className="text-xl font-bold text-slate-900">{companyName}</h1>
            {settings?.support_email && <p className="text-xs text-slate-500">{settings.support_email}</p>}
            {settings?.support_phone && <p className="text-xs text-slate-500">{settings.support_phone}</p>}
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <p className="text-2xl font-bold text-slate-900">INVOICE</p>
              {isPaid && (
                <span className="text-xs bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-semibold">PAID</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">#{invoice.invoice_number}</p>
            <p className="text-xs text-slate-400 mt-0.5">Issued {fmtDate(invoice.created_at)}</p>
            <p className="text-xs text-slate-400">
              {isPaid ? `Paid ${fmtDate(invoice.updated_at)}` : `Due ${fmtDate(invoice.due_date)}`}
            </p>
          </div>
        </div>

        {/* Bill To */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Bill To</p>
          <p className="text-sm font-semibold text-slate-900">{client?.display_name ?? ""}</p>
          {client?.billing_address && <p className="text-sm text-slate-600">{client.billing_address}</p>}
          {client?.billing_city && (
            <p className="text-sm text-slate-600">
              {client.billing_city}{client.billing_state ? `, ${client.billing_state}` : ""}{client.billing_zip ? ` ${client.billing_zip}` : ""}
            </p>
          )}
        </div>

        <div className="border-t border-slate-200 mb-6" />

        {/* Line items */}
        {lineItems && lineItems.length > 0 ? (
          <table className="w-full text-sm mb-6">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="text-center py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">Qty</th>
                <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Unit</th>
                <th className="text-right py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineItems.map((li) => (
                <tr key={li.id}>
                  <td className="py-2.5 text-slate-700">{li.description ?? li.name}</td>
                  <td className="py-2.5 text-center text-slate-600">{li.qty}</td>
                  <td className="py-2.5 text-right text-slate-600">{fmt(li.rate_cents)}</td>
                  <td className="py-2.5 text-right font-medium text-slate-900">{fmt(li.total_cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td colSpan={3} className="pt-3 text-right text-sm font-bold text-slate-900">Total</td>
                <td className="pt-3 text-right text-base font-bold text-slate-900">{fmt(invoice.total_cents)}</td>
              </tr>
              {invoice.balance_cents < invoice.total_cents && (
                <>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm text-slate-500">Paid</td>
                    <td className="pt-1 text-right text-sm text-green-700">−{fmt(invoice.total_cents - invoice.balance_cents)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="pt-1 text-right text-sm font-bold text-slate-900">Balance Due</td>
                    <td className="pt-1 text-right text-sm font-bold text-slate-900">{fmt(invoice.balance_cents)}</td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        ) : (
          <div className="flex items-center justify-between py-4 border-b border-slate-200 mb-6">
            <span className="text-sm text-slate-700">Services rendered</span>
            <span className="text-lg font-bold text-slate-900">{fmt(invoice.total_cents)}</span>
          </div>
        )}

        {/* Notes */}
        {invoice.notes && (
          <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600 mb-6">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="whitespace-pre-wrap">{invoice.notes}</p>
          </div>
        )}

        {/* Balance due box */}
        {!isPaid && (
          <div
            className="rounded-xl px-4 py-4 text-white"
            style={{ backgroundColor: accent }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium opacity-90">Amount Due</p>
              <p className="text-2xl font-bold">{fmt(invoice.balance_cents)}</p>
            </div>
            <p className="text-xs opacity-75 mt-1">Due by {fmtDate(invoice.due_date)}</p>
          </div>
        )}

        {isPaid && (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-center">
            <p className="text-green-700 font-semibold">✓ Paid in full</p>
            <p className="text-xs text-green-600 mt-1">{fmtDate(invoice.updated_at)}</p>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
          <p>{companyName}{settings?.support_email ? ` · ${settings.support_email}` : ""}{settings?.support_phone ? ` · ${settings.support_phone}` : ""}</p>
          <p className="mt-0.5">Thank you for your business.</p>
        </div>
      </div>
    </>
  );
}
