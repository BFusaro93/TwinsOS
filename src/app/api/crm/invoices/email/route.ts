import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceId } = await req.json() as { invoiceId: string };
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  // Load invoice with client and line items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inv, error: invErr } = await (supabase as any)
    .from("crm_invoices")
    .select("*, clients(display_name, primary_email, billing_address, billing_city, billing_state, billing_zip), crm_invoice_line_items(*)")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .single();

  if (invErr || !inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const clientEmail = inv.clients?.primary_email;
  if (!clientEmail) {
    return NextResponse.json({ error: "Client has no email address on file" }, { status: 422 });
  }

  // Load org name for the email header
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  const { data: org } = profile?.org_id
    ? await supabase.from("organizations").select("name").eq("id", profile.org_id).single()
    : { data: null };
  const orgName = org?.name ?? "Your Service Provider";

  const lineItems: { name: string | null; description: string; qty: number; rate_cents: number; total_cents: number }[] =
    (inv.crm_invoice_line_items ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;margin:0;padding:0;background:#f8fafc">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:24px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <!-- Header -->
  <div style="background:#1e3a5f;padding:24px 32px">
    <h1 style="color:#fff;margin:0;font-size:22px">${orgName}</h1>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:14px">Invoice #${inv.invoice_number}</p>
  </div>

  <!-- Details row -->
  <div style="padding:24px 32px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between">
    <div>
      <p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#94a3b8;letter-spacing:.05em">Bill To</p>
      <p style="margin:0;font-weight:600">${inv.clients?.display_name ?? ""}</p>
      ${inv.clients?.billing_address ? `<p style="margin:4px 0 0;font-size:13px;color:#64748b">${inv.clients.billing_address}<br>${inv.clients.billing_city ?? ""}, ${inv.clients.billing_state ?? ""} ${inv.clients.billing_zip ?? ""}</p>` : ""}
    </div>
    <div style="text-align:right">
      <table style="font-size:13px;color:#475569">
        <tr><td style="padding:2px 0;color:#94a3b8;padding-right:16px">Invoice Date</td><td style="font-weight:500">${fmtDate(inv.invoice_date)}</td></tr>
        <tr><td style="padding:2px 0;color:#94a3b8;padding-right:16px">Due Date</td><td style="font-weight:500">${fmtDate(inv.due_date)}</td></tr>
        <tr><td style="padding:2px 0;color:#94a3b8;padding-right:16px">Status</td><td style="font-weight:500;text-transform:capitalize">${inv.status}</td></tr>
      </table>
    </div>
  </div>

  <!-- Line items -->
  <div style="padding:0 32px">
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px">
      <thead>
        <tr style="border-bottom:2px solid #e2e8f0">
          <th style="text-align:left;padding:8px 0;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Service</th>
          <th style="text-align:left;padding:8px 0;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Description</th>
          <th style="text-align:right;padding:8px 0;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Qty</th>
          <th style="text-align:right;padding:8px 0;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Rate</th>
          <th style="text-align:right;padding:8px 0;color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItems.map((li) => `
        <tr style="border-bottom:1px solid #f1f5f9">
          <td style="padding:10px 0;color:#475569;font-weight:500">${li.name ?? ""}</td>
          <td style="padding:10px 0;color:#64748b">${li.description ?? ""}</td>
          <td style="padding:10px 0;text-align:right">${li.qty}</td>
          <td style="padding:10px 0;text-align:right">${formatCents(li.rate_cents)}</td>
          <td style="padding:10px 0;text-align:right;font-weight:500">${formatCents(li.total_cents)}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  </div>

  <!-- Totals -->
  <div style="padding:16px 32px 24px;display:flex;justify-content:flex-end">
    <table style="font-size:13px;min-width:220px">
      <tr><td style="padding:4px 0;color:#64748b;padding-right:24px">Subtotal</td><td style="text-align:right">${formatCents(inv.subtotal_cents)}</td></tr>
      ${inv.tax_cents > 0 ? `<tr><td style="padding:4px 0;color:#b45309;padding-right:24px">Tax (${(inv.tax_rate_bps / 100).toFixed(2)}%)</td><td style="text-align:right;color:#b45309">${formatCents(inv.tax_cents)}</td></tr>` : ""}
      <tr style="border-top:2px solid #e2e8f0"><td style="padding:8px 0;font-weight:700;font-size:15px;padding-right:24px">Total</td><td style="text-align:right;font-weight:700;font-size:15px">${formatCents(inv.total_cents)}</td></tr>
      ${inv.amount_paid_cents > 0 ? `<tr><td style="padding:4px 0;color:#16a34a;padding-right:24px">Paid</td><td style="text-align:right;color:#16a34a">(${formatCents(inv.amount_paid_cents)})</td></tr>` : ""}
      ${inv.balance_cents > 0 ? `<tr><td style="padding:4px 0;color:#dc2626;font-weight:600;padding-right:24px">Balance Due</td><td style="text-align:right;color:#dc2626;font-weight:600">${formatCents(inv.balance_cents)}</td></tr>` : ""}
    </table>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center">
    <p style="margin:0;font-size:12px;color:#94a3b8">Thank you for your business! Please contact us with any questions.</p>
  </div>
</div>
</body>
</html>`;

  const resend = new Resend(process.env.RESEND_API_KEY?.trim());
  const { error: sendErr } = await resend.emails.send({
    from: FROM,
    to: clientEmail,
    subject: `Invoice #${inv.invoice_number} from ${orgName} — ${formatCents(inv.total_cents)} due ${fmtDate(inv.due_date)}`,
    html,
  });

  if (sendErr) {
    console.error("[email-invoice] Resend error:", sendErr);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }

  // Update invoice status to "sent" if it hasn't been emailed yet. "printed" is
  // included so a "both" delivery-method client's invoice — printed first, then
  // emailed — correctly progresses instead of staying stuck at "printed" forever.
  if (inv.status === "draft" || inv.status === "printed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("crm_invoices").update({ status: "sent" }).eq("id", invoiceId);
  }

  // Log activity
  if (inv.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      org_id: profile?.org_id,
      client_id: inv.client_id,
      activity_type: "email",
      subject: `Invoice #${inv.invoice_number} sent via email`,
      body: `Sent to ${clientEmail}`,
      sent_to: clientEmail,
      ref_id: invoiceId,
      ref_table: "crm_invoices",
      occurred_at: new Date().toISOString(),
      created_by: user.id,
    });
  }

  return NextResponse.json({ ok: true });
}
