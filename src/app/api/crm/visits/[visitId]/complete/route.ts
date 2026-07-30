import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recalcNextPackageVisitDate } from "@/lib/package-visit-recalc";

// Billing-period boundaries (inclusive, "YYYY-MM-DD") for batching auto-invoices
// under a client's weekly/monthly invoice_frequency. Computed in UTC to avoid
// server-timezone drift shifting a date across a period boundary.
function getMonthRange(dateStr: string): { start: string; end: string } {
  const [y, m] = dateStr.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function getWeekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

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
    .select("job_id, client_id, invoice_description, scheduled_date, status, job_service_id")
    .eq("id", visitId)
    .single();

  if (visitErr || !visit) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }

  // Idempotent: a visit already marked completed must not re-run the
  // side effects below (duplicate activity-timeline entries, duplicate
  // auto-invoices) if this route is called again for it — e.g. a repeat
  // "Mark Complete" click before the UI reflects the first one.
  if ((visit as { status: string }).status === "completed") {
    return NextResponse.json({ ok: true, jobId: (visit as { job_id: string }).job_id, clientId: (visit as { client_id: string }).client_id, alreadyCompleted: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: vErr } = await (supabase as any)
    .from("crm_job_visits")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", visitId);

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });

  // Push the next package-sequenced visit's date out if this one completed later
  // than its static schedule assumed. Non-fatal — a failure here shouldn't block
  // the rest of the completion flow (invoicing, activity logging).
  try {
    await recalcNextPackageVisitDate(
      supabase,
      (visit as { job_service_id: string | null }).job_service_id,
      new Date().toISOString().slice(0, 10)
    );
  } catch (err) {
    console.error("[visits/complete] package min_days recalc failed:", err);
  }

  // Fetch the full job to determine type and contract linkage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job } = await (supabase as any)
    .from("crm_jobs")
    .select("id, job_type, contract_id, client_id, invoice_description, rate_cents, po_number, sales_rep_id, crm_job_services(id, service_name, qty, rate_cents, crm_services(invoice_description)), clients(invoice_frequency)")
    .eq("id", (visit as any).job_id)
    .single();

  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = job as any;

  // Jobs that close on completion (no more scheduled visits expected).
  // A one_time/waiting_list job can still have MORE THAN ONE visit when its
  // services were split one-visit-per-service (see per-service visit
  // splitting) — only close the job once every sibling visit has also
  // reached a terminal status, or a job with an unfinished service (e.g.
  // Mulch still scheduled) gets marked "completed" the moment its FIRST
  // service visit does, which then hides that sibling visit from the
  // dispatch board (parent-job-done filter treats it as abandoned).
  const terminalTypes = new Set(["one_time", "waiting_list"]);
  const terminalVisitStatuses = new Set(["completed", "cancelled", "skipped"]);

  let allSiblingVisitsDone = true;
  if (j && terminalTypes.has(j.job_type)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: siblingVisits } = await (supabase as any)
      .from("crm_job_visits")
      .select("id, status")
      .eq("job_id", j.id)
      .is("deleted_at", null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allSiblingVisitsDone = ((siblingVisits ?? []) as { id: string; status: string }[])
      .every((sv) => sv.id === visitId || terminalVisitStatuses.has(sv.status));
  }

  if (j && terminalTypes.has(j.job_type) && allSiblingVisitsDone) {
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
  // Recurring/package/project jobs can have many visits so each visit gets its own invoice.
  // One-time and waiting-list jobs used to be exactly one visit, so we guarded against a
  // duplicate invoice per job — but per-service visit splitting means a one_time/waiting_list
  // job can now have several visits (one per service), each completing independently, so that
  // guard is only valid for a visit with no linked service (the legacy single-visit case).
  // Snow jobs are excluded — they're billed exclusively through the dedicated Snow Invoicing
  // page (per-inch/hourly rates this flat auto-invoice can't compute), matching the SA guide's
  // "separate, manual Invoicing" design for snow.
  const shouldAutoInvoice = orgId && j && !j.contract_id && j.job_type !== "snow";
  const isTerminalJobType = j && (j.job_type === "one_time" || j.job_type === "waiting_list");
  const visitJobServiceId: string | null = (visit as any).job_service_id ?? null;

  try {
  if (shouldAutoInvoice) {
    let skipInvoice = false;
    if (isTerminalJobType && !visitJobServiceId) {
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
      // A visit linked to one specific service (the per-service-split case) bills only
      // that service — otherwise every visit on a multi-service job would re-bill every
      // OTHER service too, including ones that aren't done yet. A visit covering the
      // whole job (no linked service) falls back to all of the job's services, same as
      // before splitting existed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allServices: { id: string; service_name: string; qty: number; rate_cents: number; crm_services: { invoice_description: string | null } | null }[] = j.crm_job_services ?? [];
      const services = visitJobServiceId
        ? allServices.filter((s) => s.id === visitJobServiceId)
        : allServices;
      const visitInvoiceDescription: string | null = (visit as any).invoice_description ?? null;

      // Build line items from services; fall back to a single line from job rate_cents.
      // Description precedence per line: the service's own invoice description (set in
      // Services settings) falls back to its plain name.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const visitDate: string | null = (visit as any).scheduled_date ?? null;
      const lineItems = services.length > 0
        ? services.map((s) => {
            const description = visitInvoiceDescription || s.crm_services?.invoice_description || s.service_name;
            return {
              name: s.service_name,
              description,
              qty: s.qty ?? 1,
              rate_cents: s.rate_cents ?? 0,
              total_cents: (s.qty ?? 1) * (s.rate_cents ?? 0),
              service_date: visitDate,
            };
          })
        : j.rate_cents
          ? [{ name: visitInvoiceDescription ?? j.invoice_description ?? "Service", description: visitInvoiceDescription ?? j.invoice_description ?? "Service", qty: 1, rate_cents: j.rate_cents as number, total_cents: j.rate_cents as number, service_date: visitDate }]
          : [];

      const subtotal = lineItems.reduce((s: number, li: { total_cents: number }) => s + li.total_cents, 0);

      if (subtotal > 0) {
        // Clients billed weekly/monthly get every visit in the same period folded into
        // one invoice instead of one invoice per visit. "daily" and "upon_completion"
        // clients keep the original one-invoice-per-visit behavior.
        const invoiceFrequency: string = j.clients?.invoice_frequency ?? "daily";
        const periodDate = visitDate ?? today;
        const period = invoiceFrequency === "monthly"
          ? getMonthRange(periodDate)
          : invoiceFrequency === "weekly"
            ? getWeekRange(periodDate)
            : null;

        let existingInvoice: { id: string; subtotal_cents: number; total_cents: number; balance_cents: number } | null = null;
        if (period && j.client_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: openInvoice } = await (supabase as any)
            .from("crm_invoices")
            .select("id, subtotal_cents, total_cents, balance_cents")
            .eq("client_id", j.client_id)
            .eq("status", "draft")
            .is("deleted_at", null)
            .gte("invoice_date", period.start)
            .lte("invoice_date", period.end)
            .order("invoice_date", { ascending: true })
            .limit(1)
            .maybeSingle();
          existingInvoice = openInvoice ?? null;
        }

        if (existingInvoice) {
          const invoiceId = existingInvoice.id;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { count: existingItemCount } = await (supabase as any)
            .from("crm_invoice_line_items")
            .select("id", { count: "exact", head: true })
            .eq("invoice_id", invoiceId);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("crm_invoice_line_items").insert(
            lineItems.map((li: { name: string; description: string; qty: number; rate_cents: number; total_cents: number; service_date: string | null }, i: number) => ({
              invoice_id: invoiceId,
              name: li.name,
              description: li.description,
              qty: li.qty,
              rate_cents: li.rate_cents,
              total_cents: li.total_cents,
              service_date: li.service_date,
              sort_order: (existingItemCount ?? 0) + i,
            }))
          );

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from("crm_invoices")
            .update({
              subtotal_cents: existingInvoice.subtotal_cents + subtotal,
              total_cents: existingInvoice.total_cents + subtotal,
              balance_cents: existingInvoice.balance_cents + subtotal,
            })
            .eq("id", invoiceId);

          if (j.client_id) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("sync_client_balance", { p_client_id: j.client_id });
          }
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: newInvoice } = await (supabase as any)
            .from("crm_invoices")
            .insert({
              org_id: orgId,
              client_id: j.client_id,
              crm_job_id: j.id,
              sales_rep_id: j.sales_rep_id ?? null,
              description: visitInvoiceDescription ?? j.invoice_description ?? "Service",
              invoice_date: visitDate ?? today,
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
            // Auto-created invoices skip the manual "assign on save" flow, so
            // assign the number here or it stays null indefinitely.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: invoiceNumber } = await (supabase.rpc as any)(
              "assign_invoice_number",
              { p_invoice_id: (newInvoice as any).id }
            );

            // Sync the client's outstanding balance to include this new invoice
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("sync_client_balance", { p_client_id: j.client_id });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from("client_activity").insert({
              client_id: j.client_id,
              activity_type: "invoice",
              subject: `Invoice #${invoiceNumber}`,
              amount_cents: subtotal,
              ref_id: (newInvoice as any).id,
              ref_table: "crm_invoices",
            });
          }
        }
      }
    }
  }
  } catch (err) {
    // Auto-invoicing is best-effort — a failure here (e.g. a bad line-item
    // shape, a client with unusual invoice_frequency data) must not swallow
    // the "Visit completed" activity-timeline entry logged just below, which
    // previously happened silently whenever this block threw.
    console.error("[visits/complete] auto-invoice failed:", err);
  }

  // Log visit completion to client activity timeline. Include the specific
  // service and date so this entry is useful on its own — otherwise every
  // visit across every job reads as the same bare "Visit completed" with no
  // way to tell them apart in the timeline.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = visit as any;
  if (v.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visitService = visitJobServiceId
      ? ((j?.crm_job_services ?? []) as { id: string; service_name: string }[]).find((s) => s.id === visitJobServiceId)
      : null;
    const detailLabel: string | null = v.invoice_description || visitService?.service_name || null;
    const visitDateLabel = v.scheduled_date
      ? new Date(`${v.scheduled_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const subject = ["Visit completed", detailLabel ? `— ${detailLabel}` : null, visitDateLabel ? `(${visitDateLabel})` : null]
      .filter(Boolean)
      .join(" ");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("client_activity").insert({
      client_id: v.client_id,
      activity_type: "job",
      subject,
      ref_id: v.job_id,
      ref_table: "crm_jobs",
      created_by: user.id,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ ok: true, jobId: (visit as any).job_id, clientId: v.client_id });
}
