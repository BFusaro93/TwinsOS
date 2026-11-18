import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { applyVisitCompletionSideEffects } from "@/lib/visits/complete-visit-side-effects";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { logger } from "@/lib/logger";

const log = logger.child("contracts/release-held-visits");

// Runs the visit billing once per visit, so keep a whole contract's backlog
// inside one request; anything past this is reported with a `next` cursor,
// and the caller repeats with `?after=<next>` until it is null. (A visit the
// contract covers never gets an invoice line, so it stays "pending" forever —
// without the cursor, more than this many of them would starve the later ones.)
const MAX_VISITS = 400;
const IN_CHUNK = 100;

/**
 * POST /api/crm/contracts/:id/release-held-visits
 *
 * Visits completed on a contract's jobs while the contract was still a draft
 * or "sent" were HELD — not billed per visit (contractCoverage "pending"),
 * because signing would put them inside the contract price. Once the
 * contract's fate is known this re-runs the normal visit billing for every
 * completed visit on its jobs that has no live invoice line yet:
 *  - signed / active: the services are covered by the contract; only
 *    materials bill (the overage above plan for "included" ones, the full
 *    quantity for the rest);
 *  - cancelled without being signed: nothing covers them, so they bill per
 *    visit on the client's normal invoicing, like any other work.
 * The billing helper re-decides coverage itself and never bills a visit
 * twice (it skips a visit already tagged on a live invoice line), so calling
 * this again is harmless.
 *
 * Needs the `contract_edit` permission (admins always pass). The contract is
 * read under the caller's session (RLS: org + CRM access); the invoices are
 * written as the service role, like visit completion, because changing a
 * contract's status needs no invoice permission.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid contract id" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allowed } = await (supabase.rpc as any)("has_settings_permission", { p_key: "contract_edit" });
  if (allowed !== true) return NextResponse.json({ error: "You don't have permission to edit contracts" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contract, error: cErr } = await (supabase as any)
    .from("crm_contracts")
    .select("id, org_id, status, start_date")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const c = contract as { id: string; org_id: string; status: string; start_date: string | null };
  if (c.status === "draft" || c.status === "sent") {
    // Still unsigned: the visits stay held.
    return NextResponse.json({ visits: 0, invoiced: 0, held: true });
  }

  const service = createServiceClient();
  const blocked = await assertOrgWritable(service, c.org_id);
  if (blocked) return blocked;

  // Completed lead visits on the contract's jobs, from its start date on (a
  // visit before the start date was never covered, so it billed already).
  const visits = await fetchAllRows<{ id: string; scheduled_date: string | null }>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (service as any)
      .from("crm_job_visits")
      .select("id, scheduled_date, crm_jobs!inner(contract_id, org_id, deleted_at)")
      .eq("crm_jobs.contract_id", c.id)
      .eq("crm_jobs.org_id", c.org_id)
      .is("crm_jobs.deleted_at", null)
      .eq("org_id", c.org_id)
      .eq("status", "completed")
      .eq("crew_group_secondary", false)
      .is("deleted_at", null)
      .order("scheduled_date", { ascending: true })
      .order("id", { ascending: true });
    if (c.start_date) q = q.gte("scheduled_date", c.start_date);
    return q;
  });

  // Drop visits a live invoice line already bills.
  const billed = new Set<string>();
  for (let i = 0; i < visits.length; i += IN_CHUNK) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lines, error } = await (service as any)
      .from("crm_invoice_line_items")
      .select("visit_id, crm_invoices(status, deleted_at)")
      .in("visit_id", visits.slice(i, i + IN_CHUNK).map((v) => v.id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const l of (lines ?? []) as { visit_id: string; crm_invoices: { status: string; deleted_at: string | null } | null }[]) {
      if (l.crm_invoices && l.crm_invoices.deleted_at == null && l.crm_invoices.status !== "void") billed.add(l.visit_id);
    }
  }
  // Keyset cursor on (scheduled_date, id) — the list's own order. Finding the
  // cursor visit by id in the list restarted from the top whenever it dropped
  // out between pages (deleted, un-completed, now billed elsewhere): findIndex
  // gave -1, so +1 = 0. A key compares correctly whether or not that visit is
  // still listed. "<YYYY-MM-DD>~<uuid>" ("~<uuid>" for an undated visit); a bare
  // uuid from an older client is resolved to its key once.
  const afterParam = new URL(request.url).searchParams.get("after");
  let cursor: { date: string | null; id: string } | null = null;
  if (afterParam) {
    const sep = afterParam.lastIndexOf("~");
    const id = sep >= 0 ? afterParam.slice(sep + 1) : afterParam;
    const datePart = sep >= 0 ? afterParam.slice(0, sep) : null;
    if (!z.string().uuid().safeParse(id).success || (datePart && !/^\d{4}-\d{2}-\d{2}$/.test(datePart))) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }
    if (sep >= 0) {
      cursor = { date: datePart || null, id };
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: at } = await (service as any)
        .from("crm_job_visits")
        .select("scheduled_date")
        .eq("id", id)
        .eq("org_id", c.org_id)
        .maybeSingle();
      cursor = { date: (at as { scheduled_date: string | null } | null)?.scheduled_date ?? null, id };
    }
  }
  // Ascending order puts undated visits last (Postgres NULLS LAST).
  const sortDate = (d: string | null) => d ?? "9999-99-99";
  const afterCursor = (v: { id: string; scheduled_date: string | null }) => {
    if (!cursor) return true;
    const a = sortDate(v.scheduled_date);
    const b = sortDate(cursor.date);
    return a > b || (a === b && v.id > cursor.id);
  };
  const pending = visits.filter((v) => afterCursor(v) && !billed.has(v.id));
  const batch = pending.slice(0, MAX_VISITS);

  let invoiced = 0;
  let failed = 0;
  for (const v of batch) {
    const r = await applyVisitCompletionSideEffects({
      supabase: service,
      orgId: c.org_id,
      visitId: v.id,
      userId: user.id,
      dedupeActivity: true,
      fireAutomations: false,
    });
    if (r.invoiced) invoiced += 1;
    if (!r.ok || r.invoiceSkipReason === "error") failed += 1;
  }
  if (failed > 0) log.error("some held visits could not be billed", { contractId: c.id, failed, of: batch.length });

  return NextResponse.json({
    visits: batch.length,
    invoiced,
    failed,
    remaining: pending.length - batch.length,
    next: pending.length > batch.length
      ? `${batch[batch.length - 1].scheduled_date ?? ""}~${batch[batch.length - 1].id}`
      : null,
  });
}
