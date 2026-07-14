import { createClient as createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv } = await (supabase as any)
    .from("crm_invoices")
    .select("*, clients(display_name, billing_address, billing_city, billing_state, billing_zip, primary_email), crm_invoice_line_items(*)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!inv) notFound();

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", (await supabase.auth.getUser()).data.user?.id ?? "").single();
  const { data: org } = profile?.org_id
    ? await supabase.from("organizations").select("name").eq("id", profile.org_id).single()
    : { data: null };
  const orgName = org?.name ?? "Your Service Provider";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineItems: any[] = (inv.crm_invoice_line_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order);

  return (
    <html>
      <head>
        <title>Invoice #{inv.invoice_number} — {orgName}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #1e293b; background: #fff; padding: 40px; font-size: 13px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
          .org-name { font-size: 22px; font-weight: 700; color: #1e3a5f; }
          .inv-badge { background: #4a8a33; color: #fff; border-radius: 6px; padding: 8px 16px; text-align: right; }
          .inv-badge .num { font-size: 18px; font-weight: 700; }
          .inv-badge .lbl { font-size: 11px; opacity: 0.8; }
          .meta-row { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
          .section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600; margin-bottom: 8px; }
          .client-name { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
          .client-addr { color: #64748b; line-height: 1.5; }
          .detail-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .detail-table td { padding: 4px 0; }
          .detail-table td:first-child { color: #94a3b8; width: 140px; }
          table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          table.items thead th { background: #4a8a33; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
          table.items thead th.r { text-align: right; }
          table.items tbody td { padding: 9px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
          table.items tbody td.r { text-align: right; font-variant-numeric: tabular-nums; }
          .totals { display: flex; justify-content: flex-end; }
          .totals-table { min-width: 240px; border-collapse: collapse; }
          .totals-table td { padding: 5px 0; }
          .totals-table td:first-child { color: #64748b; padding-right: 24px; }
          .totals-table td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
          .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #e2e8f0; padding-top: 8px; }
          .balance-row td { color: #dc2626; font-weight: 600; }
          .paid-row td { color: #16a34a; }
          .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; color: #94a3b8; font-size: 11px; }
          @media print {
            body { padding: 20px; }
            @page { margin: 0.75in; }
          }
        `}</style>
      </head>
      <body>
        <div className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e3a5f" }}>{orgName}</div>
          </div>
          <div style={{ background: "#4a8a33", color: "#fff", borderRadius: 6, padding: "8px 16px", textAlign: "right" }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>INVOICE</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>#{inv.invoice_number}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 28, paddingBottom: 20, borderBottom: "2px solid #e2e8f0" }}>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>Bill To</div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{(inv.clients as any)?.display_name ?? ""}</div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <div style={{ color: "#64748b", lineHeight: 1.5 }}>{(inv.clients as any)?.billing_address}<br />{(inv.clients as any)?.billing_city}, {(inv.clients as any)?.billing_state} {(inv.clients as any)?.billing_zip}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94a3b8", fontWeight: 600, marginBottom: 8 }}>Invoice Details</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <tbody>
                <tr><td style={{ color: "#94a3b8", width: 140, paddingBottom: 4 }}>Invoice #</td><td>{inv.invoice_number}</td></tr>
                <tr><td style={{ color: "#94a3b8", paddingBottom: 4 }}>Date</td><td>{fmtDate(inv.invoice_date)}</td></tr>
                <tr><td style={{ color: "#94a3b8", paddingBottom: 4 }}>Due Date</td><td>{fmtDate(inv.due_date)}</td></tr>
                <tr><td style={{ color: "#94a3b8", paddingBottom: 4 }}>Status</td><td style={{ textTransform: "capitalize" }}>{inv.status}</td></tr>
                {inv.po_number && <tr><td style={{ color: "#94a3b8", paddingBottom: 4 }}>PO #</td><td>{inv.po_number}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ background: "#4a8a33" }}>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>Service</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>Description</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "left", fontSize: 11, textTransform: "uppercase" }}>Date</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "right", fontSize: 11, textTransform: "uppercase" }}>Hrs</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "right", fontSize: 11, textTransform: "uppercase" }}>Men</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "right", fontSize: 11, textTransform: "uppercase" }}>Qty</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "right", fontSize: 11, textTransform: "uppercase" }}>Rate</th>
              <th style={{ color: "#fff", padding: "8px 10px", textAlign: "right", fontSize: 11, textTransform: "uppercase" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "9px 10px", fontWeight: 500 }}>{li.name ?? ""}</td>
                <td style={{ padding: "9px 10px", color: "#64748b" }}>{li.description ?? ""}</td>
                <td style={{ padding: "9px 10px", color: "#64748b" }}>{li.service_date ? fmtDate(li.service_date) : "—"}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>{li.hours ?? "—"}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>{li.men ?? "—"}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>{li.qty}</td>
                <td style={{ padding: "9px 10px", textAlign: "right" }}>{formatCents(li.rate_cents)}</td>
                <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 500 }}>
                  {formatCents(li.total_cents - (li.discount_cents ?? 0))}
                  {li.discount_cents > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 400, color: "#16a34a" }}>−{formatCents(li.discount_cents)} disc.</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <table style={{ minWidth: 240, borderCollapse: "collapse" }}>
            <tbody>
              <tr><td style={{ color: "#64748b", paddingRight: 24, paddingBottom: 4 }}>Subtotal</td><td style={{ textAlign: "right" }}>{formatCents(inv.subtotal_cents)}</td></tr>
              {inv.tax_cents > 0 && <tr><td style={{ color: "#b45309", paddingRight: 24, paddingBottom: 4 }}>Tax ({(inv.tax_rate_bps / 100).toFixed(2)}%)</td><td style={{ textAlign: "right", color: "#b45309" }}>{formatCents(inv.tax_cents)}</td></tr>}
              <tr style={{ borderTop: "2px solid #e2e8f0" }}><td style={{ fontWeight: 700, fontSize: 15, paddingRight: 24, paddingTop: 8 }}>Total</td><td style={{ textAlign: "right", fontWeight: 700, fontSize: 15, paddingTop: 8 }}>{formatCents(inv.total_cents)}</td></tr>
              {inv.amount_paid_cents > 0 && <tr><td style={{ color: "#16a34a", paddingRight: 24 }}>Paid</td><td style={{ textAlign: "right", color: "#16a34a" }}>({formatCents(inv.amount_paid_cents)})</td></tr>}
              {inv.balance_cents > 0 && <tr><td style={{ color: "#dc2626", fontWeight: 600, paddingRight: 24 }}>Balance Due</td><td style={{ textAlign: "right", color: "#dc2626", fontWeight: 600 }}>{formatCents(inv.balance_cents)}</td></tr>}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 40, borderTop: "1px solid #e2e8f0", paddingTop: 16, textAlign: "center", color: "#94a3b8", fontSize: 11 }}>
          Thank you for your business! Questions? Contact us at{" "}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(inv.clients as any)?.primary_email ?? ""}
        </div>

        <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('load', () => window.print());" }} />
      </body>
    </html>
  );
}
