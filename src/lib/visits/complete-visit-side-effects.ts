import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { stripHtml } from "@/lib/utils/strip-html";
import { logger } from "@/lib/logger";
import { fireServiceVisitCompletedTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";

/**
 * Everything that must happen AFTER a crm_job_visits row flips to
 * status='completed', shared by every completion path so a visit finished in
 * the field bills exactly like one marked complete from the dispatch board:
 *
 *   1. Parent-job bookkeeping — close one_time/waiting_list jobs once every
 *      sibling visit is terminal; stamp last_service_date on everything else.
 *   2. Auto-invoice (contract-less, non-snow jobs), honoring the client's
 *      invoice_frequency (weekly/monthly visits fold into the period's open
 *      draft via increment_invoice_totals) and tax pass-through
 *      (crm_job_services.is_taxable + estimate / client default rate).
 *   3. "Visit completed — <service> (<date>)" client_activity timeline row.
 *   4. service_visit_completed / visit_completed automation triggers, driven
 *      through any immediately-due steps.
 *
 * Callers own authentication, authorization and the status flip itself.
 * The office route passes its RLS-scoped user client; the crew clock-out
 * route passes a service-role client because crew accounts have no RLS
 * access to invoice tables — in that case the caller has already proven the
 * crew owns the visit, and every read here is additionally pinned to orgId.
 *
 * Idempotency: invoicing is skipped when a crm_invoice_line_items row already
 * carries this visit's id (the first auto-invoice line of each visit is
 * tagged with visit_id — only the first, because
 * crm_invoice_line_items_visit_id_unique allows one row per visit). Legacy
 * single-visit one_time/waiting_list jobs keep their one-invoice-per-job
 * guard. Steps 1 and 4 are naturally safe to repeat; step 3 can be
 * de-duplicated with `dedupeActivity` (used by the backfill path).
 */

const log = logger.child("visit-completion");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface VisitCompletionSideEffectsArgs {
  supabase: AnyClient;
  /** Org of the visit — every lookup below is pinned to it. */
  orgId: string;
  visitId: string;
  /** Actor recorded as created_by on the activity row. */
  userId: string;
  /** Overrides the "today" used for last_service_date / invoice_date (YYYY-MM-DD, UTC). */
  today?: string;
  /** Skip the "Visit completed" row if an identical one already exists. */
  dedupeActivity?: boolean;
  /** Default true. The backfill path passes false so days-late completions don't
   * kick off follow-up sequences. */
  fireAutomations?: boolean;
}

export interface VisitCompletionSideEffectsResult {
  ok: boolean;
  jobId: string | null;
  clientId: string | null;
  invoiced: boolean;
  /** Set when invoicing was skipped, e.g. "already_invoiced", "contract", "snow", "zero_subtotal". */
  invoiceSkipReason: string | null;
  invoiceId: string | null;
  activityLogged: boolean;
  error?: string;
}

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

type VisitRow = {
  id: string;
  org_id: string | null;
  job_id: string;
  client_id: string | null;
  invoice_description: string | null;
  scheduled_date: string | null;
  status: string;
  job_service_id: string | null;
};

type JobServiceRow = {
  id: string;
  service_name: string;
  qty: number | null;
  rate_cents: number | null;
  is_taxable: boolean | null;
  crm_services: { invoice_description: string | null; is_taxable: boolean | null } | null;
};

type JobRow = {
  id: string;
  job_type: string;
  contract_id: string | null;
  client_id: string | null;
  estimate_id: string | null;
  invoice_description: string | null;
  rate_cents: number | null;
  po_number: string | null;
  sales_rep_id: string | null;
  crm_job_services: JobServiceRow[] | null;
  clients: { invoice_frequency: string | null; default_tax_rate_bps: number | null } | null;
};

type AutoInvoiceLine = {
  name: string;
  description: string;
  qty: number;
  rate_cents: number;
  total_cents: number;
  service_date: string | null;
  is_taxable: boolean;
};

export async function applyVisitCompletionSideEffects(
  args: VisitCompletionSideEffectsArgs
): Promise<VisitCompletionSideEffectsResult> {
  const { supabase, orgId, visitId, userId } = args;
  const fireAutomations = args.fireAutomations ?? true;
  const today = args.today ?? new Date().toISOString().slice(0, 10);

  const result: VisitCompletionSideEffectsResult = {
    ok: false,
    jobId: null,
    clientId: null,
    invoiced: false,
    invoiceSkipReason: null,
    invoiceId: null,
    activityLogged: false,
  };

  const { data: visitData, error: visitErr } = await supabase
    .from("crm_job_visits")
    .select("id, org_id, job_id, client_id, invoice_description, scheduled_date, status, job_service_id")
    .eq("id", visitId)
    .eq("org_id", orgId)
    .maybeSingle();
  const visit = visitData as VisitRow | null;
  if (visitErr || !visit) {
    result.error = visitErr?.message ?? "Visit not found";
    return result;
  }
  result.jobId = visit.job_id;
  result.clientId = visit.client_id;
  const visitJobServiceId = visit.job_service_id ?? null;

  // ── 1. Parent-job bookkeeping ─────────────────────────────────────────────
  const { data: jobData } = await supabase
    .from("crm_jobs")
    .select("id, job_type, contract_id, client_id, estimate_id, invoice_description, rate_cents, po_number, sales_rep_id, crm_job_services(id, service_name, qty, rate_cents, is_taxable, crm_services(invoice_description, is_taxable)), clients(invoice_frequency, default_tax_rate_bps)")
    .eq("id", visit.job_id)
    .eq("org_id", orgId)
    .maybeSingle();
  const j = jobData as JobRow | null;

  // Jobs that close on completion (no more scheduled visits expected).
  // A one_time/waiting_list job can still have MORE THAN ONE visit when its
  // services were split one-visit-per-service — only close the job once every
  // sibling visit has also reached a terminal status, or a job with an
  // unfinished service gets marked "completed" the moment its FIRST service
  // visit does, which then hides that sibling visit from the dispatch board.
  const terminalTypes = new Set(["one_time", "waiting_list"]);
  const terminalVisitStatuses = new Set(["completed", "cancelled", "skipped"]);

  let allSiblingVisitsDone = true;
  if (j && terminalTypes.has(j.job_type)) {
    const { data: siblingVisits } = await supabase
      .from("crm_job_visits")
      .select("id, status")
      .eq("job_id", j.id)
      .is("deleted_at", null);
    allSiblingVisitsDone = ((siblingVisits ?? []) as { id: string; status: string }[])
      .every((sv) => sv.id === visitId || terminalVisitStatuses.has(sv.status));
  }

  if (j && terminalTypes.has(j.job_type) && allSiblingVisitsDone) {
    const { error: jErr } = await supabase
      .from("crm_jobs")
      .update({ status: "completed", is_complete: true })
      .eq("id", j.id);
    if (jErr) {
      result.error = jErr.message;
      return result;
    }
  } else if (j) {
    // Recurring / package / project / snow — parent job stays as-is; just stamp last service date
    await supabase
      .from("crm_jobs")
      .update({ last_service_date: today })
      .eq("id", j.id);
  }

  // ── 2. Auto-invoice ───────────────────────────────────────────────────────
  // Create a draft invoice for any completed visit whose job has no contract.
  // Jobs linked to a contract are billed on the contract's billing cycle instead.
  // Snow jobs are excluded — they're billed exclusively through the dedicated
  // Snow Invoicing page (per-inch/hourly rates this flat auto-invoice can't
  // compute).
  try {
    if (!j) {
      result.invoiceSkipReason = "job_not_found";
    } else if (j.contract_id) {
      result.invoiceSkipReason = "contract";
    } else if (j.job_type === "snow") {
      result.invoiceSkipReason = "snow";
    } else {
      // Idempotency: a visit that already produced an invoice line must never
      // be billed twice, whichever completion path (office, crew, backfill)
      // gets here second.
      const { data: existingLine } = await supabase
        .from("crm_invoice_line_items")
        .select("id, invoice_id")
        .eq("visit_id", visitId)
        .limit(1)
        .maybeSingle();
      if (existingLine) {
        result.invoiceSkipReason = "already_invoiced";
        result.invoiceId = (existingLine as { invoice_id: string }).invoice_id;
      }

      // One-time and waiting-list jobs used to be exactly one visit, so we guarded
      // against a duplicate invoice per job — per-service visit splitting means such
      // a job can now have several visits (one per service), each completing
      // independently, so that guard is only valid for a visit with no linked
      // service (the legacy single-visit case).
      const isTerminalJobType = j.job_type === "one_time" || j.job_type === "waiting_list";
      if (!result.invoiceSkipReason && isTerminalJobType && !visitJobServiceId) {
        const { data: existingInvoice } = await supabase
          .from("crm_invoices")
          .select("id")
          .eq("crm_job_id", j.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (existingInvoice) {
          result.invoiceSkipReason = "job_already_invoiced";
          result.invoiceId = (existingInvoice as { id: string }).id;
        }
      }

      if (!result.invoiceSkipReason) {
        // A visit linked to one specific service (the per-service-split case) bills only
        // that service — otherwise every visit on a multi-service job would re-bill every
        // OTHER service too, including ones that aren't done yet. A visit covering the
        // whole job (no linked service) falls back to all of the job's services.
        const allServices: JobServiceRow[] = j.crm_job_services ?? [];
        const services = visitJobServiceId
          ? allServices.filter((s) => s.id === visitJobServiceId)
          : allServices;
        const visitInvoiceDescription: string | null = visit.invoice_description ?? null;
        const visitDate: string | null = visit.scheduled_date ?? null;

        // Taxability (D-12): each job service snapshots is_taxable when the job
        // is created (from the accepted estimate, or the service catalog via the
        // crm_job_services default trigger). Rows predating that column fall
        // back to the catalog flag. The rate comes from the accepted estimate
        // when the job was converted from one — so the invoice reproduces the
        // tax the client agreed to — otherwise the client's default rate.
        let taxRateBps = 0;
        if (j.estimate_id) {
          const { data: est } = await supabase
            .from("estimates")
            .select("tax_rate_bps")
            .eq("id", j.estimate_id)
            .maybeSingle();
          taxRateBps = (est as { tax_rate_bps: number | null } | null)?.tax_rate_bps ?? 0;
        }
        if (taxRateBps <= 0) taxRateBps = j.clients?.default_tax_rate_bps ?? 0;

        // Build line items from services; fall back to a single line from job rate_cents.
        // Description precedence per line: this visit's own override, then the job-level
        // master override (Job > Invoice Desc tab), then the service's own invoice
        // description (set in Services settings), then its plain name.
        const lineItems: AutoInvoiceLine[] = services.length > 0
          ? services.map((s) => {
              const description = visitInvoiceDescription || j.invoice_description || stripHtml(s.crm_services?.invoice_description || "") || s.service_name;
              return {
                name: s.service_name,
                description,
                qty: s.qty ?? 1,
                rate_cents: s.rate_cents ?? 0,
                total_cents: (s.qty ?? 1) * (s.rate_cents ?? 0),
                service_date: visitDate,
                is_taxable: s.is_taxable ?? s.crm_services?.is_taxable ?? false,
              };
            })
          : j.rate_cents
            ? [{ name: visitInvoiceDescription ?? j.invoice_description ?? "Service", description: visitInvoiceDescription ?? j.invoice_description ?? "Service", qty: 1, rate_cents: j.rate_cents, total_cents: j.rate_cents, service_date: visitDate, is_taxable: false }]
            : [];

        const subtotal = lineItems.reduce((s, li) => s + li.total_cents, 0);
        const taxableSubtotal = lineItems.filter((li) => li.is_taxable).reduce((s, li) => s + li.total_cents, 0);
        const taxCents = Math.round((taxableSubtotal * taxRateBps) / 10000);

        // Tag only the FIRST line with visit_id — the unique constraint permits one
        // row per visit — which is enough for the idempotency lookup above.
        // org_id is set explicitly: its DEFAULT my_org_id() resolves to null under
        // the service-role client the crew path uses.
        const toLineRows = (invoiceId: string, sortOffset: number) =>
          lineItems.map((li, i) => ({
            org_id: orgId,
            invoice_id: invoiceId,
            name: li.name,
            description: li.description,
            qty: li.qty,
            rate_cents: li.rate_cents,
            total_cents: li.total_cents,
            service_date: li.service_date,
            is_taxable: li.is_taxable,
            sort_order: sortOffset + i,
            visit_id: i === 0 ? visitId : null,
          }));

        if (subtotal <= 0) {
          result.invoiceSkipReason = "zero_subtotal";
        } else {
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

          let existingInvoice: { id: string } | null = null;
          if (period && j.client_id) {
            // A locked invoice (printed/manually locked for review) must not be
            // silently appended to — fall through to creating a fresh draft for
            // this period instead, same as if no open invoice existed yet.
            const { data: openInvoice } = await supabase
              .from("crm_invoices")
              .select("id")
              .eq("org_id", orgId)
              .eq("client_id", j.client_id)
              .eq("status", "draft")
              .eq("locked", false)
              .is("deleted_at", null)
              .gte("invoice_date", period.start)
              .lte("invoice_date", period.end)
              .order("invoice_date", { ascending: true })
              .limit(1)
              .maybeSingle();
            existingInvoice = (openInvoice as { id: string } | null) ?? null;
          }

          if (existingInvoice) {
            const invoiceId = existingInvoice.id;
            const { count: existingItemCount } = await supabase
              .from("crm_invoice_line_items")
              .select("id", { count: "exact", head: true })
              .eq("invoice_id", invoiceId);

            const { error: lineErr } = await supabase
              .from("crm_invoice_line_items")
              .insert(toLineRows(invoiceId, existingItemCount ?? 0));
            if (lineErr) throw lineErr;

            // Atomic increment — two visits for the same client completing
            // concurrently must not both read the same stale totals and have
            // the second write clobber the first. The RPC also re-derives
            // tax_cents from the invoice's line items at the invoice's
            // tax_rate_bps, so appended taxable visits are taxed too.
            await supabase.rpc("increment_invoice_totals", {
              p_invoice_id: invoiceId,
              p_delta_cents: subtotal,
            });

            if (j.client_id) {
              await supabase.rpc("sync_client_balance", { p_client_id: j.client_id });
            }
            result.invoiced = true;
            result.invoiceId = invoiceId;
          } else {
            const { data: newInvoice, error: invErr } = await supabase
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
                tax_rate_bps: taxRateBps,
                tax_cents: taxCents,
                total_cents: subtotal + taxCents,
                balance_cents: subtotal + taxCents,
                amount_paid_cents: 0,
                po_number: j.po_number ?? null,
              })
              .select("id, invoice_number")
              .single();
            if (invErr) throw invErr;
            const newInvoiceId = (newInvoice as { id: string }).id;

            if (lineItems.length > 0) {
              const { error: lineErr } = await supabase
                .from("crm_invoice_line_items")
                .insert(toLineRows(newInvoiceId, 0));
              if (lineErr) throw lineErr;
            }

            if (j.client_id) {
              // Auto-created invoices skip the manual "assign on save" flow, so
              // assign the number here or it stays null indefinitely.
              const { data: invoiceNumber, error: assignErr } = await supabase.rpc(
                "assign_invoice_number",
                { p_invoice_id: newInvoiceId }
              );
              if (assignErr) log.error("assign_invoice_number failed", { visitId, error: assignErr.message });

              // Sync the client's outstanding balance to include this new invoice
              await supabase.rpc("sync_client_balance", { p_client_id: j.client_id });

              // Skip logging if the number assignment failed — a broken "Invoice
              // #null" entry is worse than none; the invoice will still get a
              // correct timeline entry whenever it's next saved manually.
              if (invoiceNumber != null) {
                await supabase.from("client_activity").insert({
                  org_id: orgId,
                  client_id: j.client_id,
                  activity_type: "invoice",
                  subject: `Invoice #${invoiceNumber}`,
                  amount_cents: subtotal + taxCents,
                  ref_id: newInvoiceId,
                  ref_table: "crm_invoices",
                });
              }
            }
            result.invoiced = true;
            result.invoiceId = newInvoiceId;
          }
        }
      }
    }
  } catch (err) {
    // Auto-invoicing is best-effort — a failure here must not swallow the
    // "Visit completed" activity-timeline entry logged just below.
    log.error("auto-invoice failed", { visitId, error: err instanceof Error ? err.message : String(err) });
    result.invoiceSkipReason = result.invoiceSkipReason ?? "error";
  }

  // ── 3. Client activity timeline ───────────────────────────────────────────
  // Include the specific service and date so this entry is useful on its own —
  // otherwise every visit across every job reads as the same bare "Visit
  // completed" with no way to tell them apart in the timeline.
  if (visit.client_id) {
    const visitService = visitJobServiceId
      ? (j?.crm_job_services ?? []).find((s) => s.id === visitJobServiceId)
      : null;
    const detailLabel: string | null = visit.invoice_description || visitService?.service_name || null;
    const visitDateLabel = visit.scheduled_date
      ? new Date(`${visit.scheduled_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null;
    const subject = ["Visit completed", detailLabel ? `— ${detailLabel}` : null, visitDateLabel ? `(${visitDateLabel})` : null]
      .filter(Boolean)
      .join(" ");

    let alreadyLogged = false;
    if (args.dedupeActivity) {
      const { data: existingRow } = await supabase
        .from("client_activity")
        .select("id")
        .eq("client_id", visit.client_id)
        .eq("activity_type", "job")
        .eq("ref_id", visit.job_id)
        .eq("subject", subject)
        .limit(1)
        .maybeSingle();
      alreadyLogged = !!existingRow;
    }

    if (!alreadyLogged) {
      const { error: actErr } = await supabase.from("client_activity").insert({
        org_id: orgId,
        client_id: visit.client_id,
        activity_type: "job",
        subject,
        ref_id: visit.job_id,
        ref_table: "crm_jobs",
        created_by: userId,
      });
      if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
      else result.activityLogged = true;
    }
  }

  // ── 4. Automation triggers ────────────────────────────────────────────────
  // Fire any 'service_visit_completed' sequence triggers configured for the
  // service(s) this visit covered. Best-effort — an automation-enrollment
  // failure must never block the completion response.
  if (fireAutomations) {
    try {
      if (visit.client_id) {
        let serviceIds: string[] = [];
        if (visitJobServiceId) {
          const { data: js } = await supabase
            .from("crm_job_services")
            .select("service_id")
            .eq("id", visitJobServiceId)
            .maybeSingle();
          const sid = (js as { service_id: string | null } | null)?.service_id;
          if (sid) serviceIds = [sid];
        } else {
          const { data: jobServices } = await supabase
            .from("crm_job_services")
            .select("service_id")
            .eq("job_id", visit.job_id);
          serviceIds = ((jobServices ?? []) as { service_id: string | null }[])
            .map((s) => s.service_id)
            .filter((id): id is string => !!id);
        }

        const newEnrollmentIds: string[] = [];
        if (serviceIds.length > 0) {
          newEnrollmentIds.push(...await fireServiceVisitCompletedTriggers(supabase, { orgId, clientId: visit.client_id, serviceIds }));
        }
        newEnrollmentIds.push(
          ...await fireSimpleTrigger(supabase, { orgId, clientId: visit.client_id, triggerType: "visit_completed", matchValues: serviceIds })
        );

        // Drive each new enrollment through any steps due right now (e.g. an
        // email with no "wait" in front of it) instead of leaving it queued
        // for the next daily /api/automations/run cron sweep. Needs the
        // service-role client since the processor writes across tables not
        // all covered by a request's RLS-scoped session.
        if (newEnrollmentIds.length > 0) {
          const adminClient = createClient<Database>(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );
          for (const enrollmentId of newEnrollmentIds) {
            await processEnrollmentImmediately(adminClient, enrollmentId);
          }
        }
      }
    } catch (err) {
      log.error("automation trigger enrollment failed", { visitId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  result.ok = true;
  return result;
}
