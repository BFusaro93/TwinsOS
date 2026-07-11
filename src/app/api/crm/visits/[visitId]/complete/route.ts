import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  const orgId: string | null = (profile as any)?.org_id ?? null;

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitErr } = await (supabase as any)
    .from("crm_job_visits")
    .select("job_id, client_id, invoice_description, scheduled_date")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: vErr } = await (supabase as any)
    .from("crm_job_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", visitId);

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  // Fetch the full job to determine type and contract linkage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job } = await (supabase as any)
    .from("crm_jobs")
    .select("id, job_type, contract_id, client_id, invoice_description, rate_cents, po_number, crm_job_services(id, service_name, qty, rate_cents)")
    .eq("id", (visit as any).job_id)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = job as any;

  // Jobs that close on completion (no more scheduled visits expected)
  const terminalTypes = new Set(["one_time", "waiting_list"]);

  if (j && terminalTypes.has(j.job_type)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: jErr } = await (supabase as any)
      .from("crm_jobs")
      .update({ status: "completed", is_complete: true })
      .eq("id", j.id);
    if (jErr) return NextResponse.json({ error: jErr.message }, { status: 500 });
  } else if (j) {
    // Recurring / package / project / snow — parent job stays as-is; just stamp last service date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("crm_jobs")
      .update({ last_service_date: today })
      .eq("id", j.id);
  }

  // Auto-invoice: create a draft invoice for any completed visit whose job has no contract.
  // Jobs linked to a contract are billed on the contract's billing cycle instead.
  // Recurring/package/snow/project jobs can have many visits so each visit gets its own invoice.
  // One-time and waiting-list jobs are terminal (one visit) so we guard against duplicates.
  const shouldAutoInvoice = orgId && j && !j.contract_id;
  const isTerminalJobType = j && (j.job_type === "one_time" || j.job_type === "waiting_list");

  if (shouldAutoInvoice) {
    let skipInvoice = false;
    if (isTerminalJobType) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingInvoice } = await (supabase as any)
        .from("crm_invoices")
        .select("id")
        .eq("crm_job_id", j.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingInvoice) skipInvoice = true;
    }

    if (!skipInvoice) {
      const services: { service_name: string; qty: number; rate_cents: number }[] = j.crm_job_services ?? [];

      // Build line items from services; fall back to a single line from job rate_cents
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const visitDate: string | null = (visit as any).scheduled_date ?? null;
      const lineItems = services.length > 0
        ? services.map((s: { service_name: string; qty: number; rate_cents: number }) => ({
            name: s.service_name,
            description: s.service_name,
            qty: s.qty ?? 1,
            rate_cents: s.rate_cents ?? 0,
            total_cents: (s.qty ?? 1) * (s.rate_cents ?? 0),
            service_date: visitDate,
          }))
        : j.rate_cents
          ? [{ name: j.invoice_description ?? "Service", description: j.invoice_description ?? "Service", qty: 1, rate_cents: j.rate_cents as number, total_cents: j.rate_cents as number, service_date: visitDate }]
          : [];

      const subtotal = lineItems.reduce((s: number, li: { total_cents: number }) => s + li.total_cents, 0);

      if (subtotal > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newInvoice } = await (supabase as any)
          .from("crm_invoices")
          .insert({
            org_id: orgId,
            client_id: j.client_id,
            crm_job_id: j.id,
            description: j.invoice_description ?? "Service",
            invoice_date: today,
            status: "draft",
            subtotal_cents: subtotal,
            tax_rate_bps: 0,
            tax_cents: 0,
            total_cents: subtotal,
            balance_cents: subtotal,
            amount_paid_cents: 0,
            po_number: j.po_number ?? null,
          })
          .select("id, invoice_number")
          .single();

        if (newInvoice && lineItems.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("crm_invoice_line_items").insert(
            lineItems.map((li: { name: string; description: string; qty: number; rate_cents: number; total_cents: number; service_date: string | null }, i: number) => ({
              invoice_id: (newInvoice as any).id,
              name: li.name,
              description: li.description,
              qty: li.qty,
              rate_cents: li.rate_cents,
              total_cents: li.total_cents,
              service_date: li.service_date,
              sort_order: i,
            }))
          );
        }

        if (newInvoice && j.client_id) {
          // Sync the client's outstanding balance to include this new invoice
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("sync_client_balance", { p_client_id: j.client_id });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("client_activity").insert({
            client_id: j.client_id,
            activity_type: "invoice",
            subject: `Invoice #${(newInvoice as any).invoice_number}`,
            amount_cents: subtotal,
            ref_id: (newInvoice as any).id,
            ref_table: "crm_invoices",
          });
        }
      }
    }
  }

  // Log visit completion to client activity timeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = visit as any;
  if (v.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: activityError } = await (supabase as any).from("client_activity").insert({
      client_id: v.client_id,
      activity_type: "job",
      subject: `Visit completed${v.invoice_description ? `: ${v.invoice_description}` : ""}`,
      ref_id: v.job_id,
      ref_table: "crm_jobs",
    });
    if (activityError) {
      console.error("[crm/visits/complete] Failed to log client_activity:", activityError);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ ok: true, jobId: (visit as any).job_id, clientId: v.client_id });
}
