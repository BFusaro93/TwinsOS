"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapVisit } from "./use-crm-jobs";
import type { CRMJobVisit } from "@/types/crm-jobs";

// "per_event"/"per_event_per_inch" bill the whole STORM, not each dispatch
// within it — a job with 2 visits during one storm (e.g. morning + afternoon
// push) is one event, not two. Unlike "per_push_per_inch" (deliberately
// per-visit) and "hourly" (naturally per-visit), these two must be billed
// once per (job, storm event), or a multi-visit storm gets charged twice.
export function isPerEventBilling(invoiceType: string): boolean {
  return invoiceType === "per_event" || invoiceType === "per_event_per_inch";
}

/** Group key for visits that must collapse to a single charge. Falls back to
 *  the visit's own id (i.e. no grouping) for per-visit billing types. */
export function billingGroupKey(visit: CRMJobVisit): string {
  const invoiceType = visit.job?.invoiceType ?? "per_event";
  if (!isPerEventBilling(invoiceType)) return visit.id;
  // stormEventId is only set by the dispatch board's storm flow — a visit
  // created directly (crew app, manual entry) leaves it null. Falling back
  // to a constant would collapse every storm-less visit of a job, across
  // every date, into one billed event — fall back to the visit's own date
  // instead so separate storms still separate into separate events.
  return `${visit.jobId}::${visit.stormEventId ?? `date:${visit.scheduledDate}`}`;
}

// ── uninvoiced snow visits ────────────────────────────────────────────────────

export function useUninvoicedSnowVisits(filters: {
  stormEventId?: string;
  clientId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  return useQuery({
    queryKey: ["snow-invoicing", "uninvoiced-visits", filters],
    queryFn: async () => {
      const supabase = createClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_job_visits")
        .select(`
          *,
          clients(display_name, primary_phone),
          crm_crews(name),
          crm_jobs!inner(*, crm_crews(name), crm_job_services(*))
        `)
        .eq("status", "completed")
        .eq("crm_jobs.job_type", "snow")
        .is("crm_jobs.contract_id", null)
        .is("deleted_at", null)
        .order("scheduled_date", { ascending: true });

      if (filters.stormEventId) q = q.eq("storm_event_id", filters.stormEventId);
      if (filters.clientId) q = q.eq("client_id", filters.clientId);
      if (filters.fromDate) q = q.gte("scheduled_date", filters.fromDate);
      if (filters.toDate) q = q.lte("scheduled_date", filters.toDate);

      const { data, error } = await q;
      if (error) throw error;
      // contract_id is filtered at the DB level, but invoice_type is filtered
      // here client-side (a plain .neq() would silently drop jobs where
      // invoice_type is NULL, per SQL's three-valued NULL comparison logic —
      // those should default to per-event billing, not be excluded).
      const visits = ((data.map(mapVisit)) as CRMJobVisit[])
        .filter((v) => v.job?.invoiceType !== "monthly_flat_rate");

      if (visits.length === 0) return [];

      // Exclude visits that already have a line item on a non-deleted invoice
      // (visit_id), so generating invoices is idempotent. Line items have no
      // deleted_at of their own — deletion happens via the parent invoice.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingLines, error: linesErr } = await (supabase as any)
        .from("crm_invoice_line_items")
        .select("visit_id, crm_invoices!inner(deleted_at)")
        .in("visit_id", visits.map((v) => v.id))
        .is("crm_invoices.deleted_at", null);
      if (linesErr) throw linesErr;

      const invoicedVisitIds = new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((existingLines ?? []) as any[]).map((r) => r.visit_id).filter(Boolean)
      );

      // Per-event billing groups (one charge per job+storm) must not be
      // partially re-billed: if a storm's morning push was already invoiced
      // and the afternoon push completes later, the afternoon push would
      // otherwise appear ALONE in the queue and get priced as a brand new
      // group — charging the full event price a second time. Once any
      // member of a group has been invoiced, exclude the whole group rather
      // than just the already-invoiced visit. (Per-visit billing types are
      // unaffected — their group key is just their own visit id.)
      const groupsWithExistingInvoice = new Set(
        visits.filter((v) => invoicedVisitIds.has(v.id)).map((v) => billingGroupKey(v))
      );

      return visits.filter(
        (v) => !invoicedVisitIds.has(v.id) && !groupsWithExistingInvoice.has(billingGroupKey(v))
      );
    },
  });
}

// ── generate invoices ─────────────────────────────────────────────────────────

export interface SnowInvoiceVisitInput {
  visitId: string;
  jobId: string;
  description: string;
  amountCents: number;
  serviceDate: string | null;
}

export function useGenerateSnowInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      groups: { clientId: string; description: string; visits: SnowInvoiceVisitInput[] }[]
    ) => {
      const supabase = createClient();
      let invoicesCreated = 0;
      const invoiceIds: string[] = [];
      let skippedZeroAmountGroups = 0;
      let excludedZeroAmountVisits = 0;

      for (const group of groups) {
        const subtotal = group.visits.reduce((s, v) => s + v.amountCents, 0);
        if (subtotal <= 0) {
          // Previously a silent `continue` — the caller reported "success"
          // even though nothing was billed for this client at all.
          skippedZeroAmountGroups += 1;
          continue;
        }

        // A $0 visit inside an otherwise-positive group (e.g. a misconfigured
        // rate) used to still get a line item inserted with its visit_id,
        // which permanently marks it "invoiced" in the queue at $0 — the
        // amount can never be corrected and re-billed. Leave it out of the
        // line items so it stays in the queue until its pricing is fixed.
        const billableVisits = group.visits.filter((v) => v.amountCents > 0);
        excludedZeroAmountVisits += group.visits.length - billableVisits.length;
        if (billableVisits.length === 0) continue;

        const distinctJobIds = new Set(billableVisits.map((v) => v.jobId));
        const singleJobId = distinctJobIds.size === 1 ? [...distinctJobIds][0] : null;
        const invoiceDate = billableVisits[0]?.serviceDate ?? new Date().toISOString().slice(0, 10);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: newInvoice, error: invErr } = await (supabase as any)
          .from("crm_invoices")
          .insert({
            client_id: group.clientId,
            crm_job_id: singleJobId,
            description: group.description,
            invoice_date: invoiceDate,
            status: "draft",
            subtotal_cents: subtotal,
            tax_rate_bps: 0,
            tax_cents: 0,
            total_cents: subtotal,
            balance_cents: subtotal,
            amount_paid_cents: 0,
          })
          .select("id, invoice_number")
          .single();
        if (invErr) throw invErr;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: liErr } = await (supabase as any).from("crm_invoice_line_items").insert(
          billableVisits.map((v, i) => ({
            invoice_id: (newInvoice as { id: string }).id,
            name: v.description,
            description: v.description,
            qty: 1,
            rate_cents: v.amountCents,
            total_cents: v.amountCents,
            service_date: v.serviceDate,
            visit_id: v.visitId,
            sort_order: i,
          }))
        );
        if (liErr) throw liErr;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: invoiceNumber } = await (supabase.rpc as any)(
          "assign_invoice_number",
          { p_invoice_id: (newInvoice as { id: string }).id }
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("sync_client_balance", { p_client_id: group.clientId });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("client_activity").insert({
          client_id: group.clientId,
          activity_type: "invoice",
          subject: `Invoice #${invoiceNumber}`,
          amount_cents: subtotal,
          ref_id: (newInvoice as { id: string }).id,
          ref_table: "crm_invoices",
        });

        invoicesCreated += 1;
        invoiceIds.push((newInvoice as { id: string }).id);
      }

      return { invoicesCreated, invoiceIds, skippedZeroAmountGroups, excludedZeroAmountVisits };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snow-invoicing"] });
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
