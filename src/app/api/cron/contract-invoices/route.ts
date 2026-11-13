import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  alreadyBilledReason,
  billedInPeriod,
  billingAnchorStamp,
  isBillingDueOn,
  planContractBilling,
  planFirstPeriodProration,
  prorationPending,
  termSkipReason,
} from "@/lib/contract-billing";
import { computeDueDate, resolveInvoiceTerms } from "@/lib/invoices/due-date";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { isoInZone, todayInZone, todayInZoneAsLocalMidnight } from "@/lib/time/zone";

/**
 * GET /api/cron/contract-invoices — called daily by Vercel Cron at 08:00 UTC
 *
 * For every active contract where:
 *   - is_active = true
 *   - auto_generate = true
 *   - status is "signed" or "active" (not draft/sent/cancelled/expired —
 *     a contract the client never signed, or one that's been cancelled or
 *     has expired, must never be auto-billed)
 *   - the client it bills hasn't been soft-deleted (nothing re-checks this
 *     once a contract is attached, so without it a deleted client keeps
 *     getting invoiced forever), and is a customer in service — not a lead,
 *     and not cancelled / inactive / lost
 *   - the billing cycle being invoiced starts on or after start_date (no
 *     invoice is dated before the start, and a cycle that began before it is
 *     never billed — the prorated stub covers that gap in prorate mode), and
 *     starts on or before end_date (the last cycle is billed in full; nothing
 *     else transitions status to "expired" when end_date arrives, so this is
 *     the only thing stopping billing past term) — see termSkipReason
 *   - today is a billing day for the contract's own billing_frequency —
 *     see src/lib/contract-billing.ts for the per-frequency cadence. For
 *     `monthly` (every live contract on PROD today) that is exactly the
 *     previous rule: billing_day_of_month = today's day-of-month, or the
 *     last day of the month when billing_day exceeds it.
 *   - no invoice already exists for this contract in the current billing
 *     PERIOD (the calendar month for `monthly`, the quarter/year/week for
 *     the other frequencies, "ever" for `one_time`)
 *
 * Creates a crm_invoices row for the period's amount — monthly_amounts[month]
 * if that month is overridden, else monthly_amount_cents, which is the
 * per-invoice amount for every frequency (see contract-billing.ts) — then
 * updates last_billed_date on the contract.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 * Reject anything else.
 */

// Most contracts bill on the 1st, so one run can have hundreds due, each with
// several sequential queries. Give it the full Pro-plan budget (like
// invoice-past-due) rather than the default, or a long first-of-the-month run
// is cut off part-way and the remaining contracts wait for the next day's
// catch-up.
export const maxDuration = 300;

function ordinal(n: number) {
  const s = ["th","st","nd","rd"];
  const v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

export async function GET(request: Request) {
  // ── auth ─────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();

  // Each contract bills on ITS OWN org's calendar. The billing-day rule
  // compares a day-of-month, so an org whose date has already rolled over on
  // the UTC server (or hasn't yet) would otherwise bill a day early or late —
  // and at a month boundary, in the wrong month entirely.
  //
  // isBillingDueOn/planContractBilling both read local Date components, so
  // handing them a Date at the org's local midnight makes them org-correct
  // without changing contract-billing.ts itself.
  const orgTodayCache = new Map<string, { str: string; date: Date; tz: string }>();
  async function orgToday(orgId: string): Promise<{ str: string; date: Date; tz: string }> {
    let hit = orgTodayCache.get(orgId);
    if (!hit) {
      const tz = await getOrgTimeZone(supabase, orgId);
      hit = { str: todayInZone(tz), date: todayInZoneAsLocalMidnight(tz), tz };
      orgTodayCache.set(orgId, hit);
    }
    return hit;
  }

  // ── fetch candidates ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  // Paged: this selects every org's billable contracts at once, and PostgREST
  // silently caps a plain select at 1000 rows — past that, whichever contracts
  // fell off the end were never billed, with no error and no log line.
  let contracts: Record<string, unknown>[];
  try {
    contracts = await fetchAllRows<Record<string, unknown>>(() =>
      sb
        .from("crm_contracts")
        .select("id, org_id, client_id, title, status, start_date, end_date, billing_day_of_month, billing_frequency, last_billed_date, billing_anchor_date, reactivated_at, signed_at, created_at, start_billing_mode, first_period_prorated_at, monthly_amount_cents, monthly_amounts, invoice_line_items, bill_month_in_advance, payment_type, po_number, sales_rep_id, clients!inner(deleted_at, default_terms, status)")
        // A cancelled client's contract must not keep billing — generate.ts already
        // treats cancelled clients (and deleted ones) as inactive for visits, but the
        // invoicing paths only checked deleted_at, so a cancelled client kept getting
        // draft invoices every period.
        .is("clients.deleted_at", null)
        // Inactive and lost clients are off service too: generate.ts stops their visits, so
        // billing follows (reactivating the client resumes it next cycle, no backfill).
        // A lead isn't a customer yet: converting it to active starts billing.
        .not("clients.status", "in", "(cancelled,inactive,lost,lead)")
        .eq("is_active", true)
        .eq("auto_generate", true)
        // Only a contract the client has actually agreed to should be auto-billed.
        // is_active/auto_generate alone aren't enough to gate this: both default
        // to true on a brand-new contract, so a still-"draft"/"sent" (never
        // signed) contract — or one the office marked "cancelled"/"expired" —
        // would otherwise be picked up here the moment its billing day rolls
        // around, since nothing else in this query looks at status at all.
        .in("status", ["signed", "active"])
        .is("deleted_at", null)
    );
  } catch (fetchErr) {
    console.error("[contract-invoices] fetch error:", fetchErr);
    return NextResponse.json({ error: fetchErr instanceof Error ? fetchErr.message : "fetch failed" }, { status: 500 });
  }

  // ── when each contract / client became billable ──────────────────────────
  // Read from the audit trail (fn_audit_log writes a status_changed row with
  // old/new status); created_at / signed_at cover rows created already billable.
  //  - Contract signed / switched to active, or client converted from a lead:
  //    the contract became billable then. A cycle whose billing day passed
  //    before that is still billed, dated the day it is created (never
  //    back-dated) — see cronInvoiceDate in contract-billing.ts.
  //  - Client REACTIVATED (cancelled / inactive / lost → active): a cycle
  //    whose billing day passed while the client was off service is not
  //    back-billed; billing resumes at the next cycle.
  // One paged read for the whole run; a failure falls back to the columns.
  const becameBillableAt = new Map<string, string>(); // contract id, or "lead:<client id>" → latest instant
  const clientReactivatedAt = new Map<string, string>(); // client id → latest instant
  const keepLatest = (map: Map<string, string>, key: string, instant: string) => {
    const prev = map.get(key);
    if (!prev || Date.parse(instant) > Date.parse(prev)) map.set(key, instant);
  };
  try {
    const auditRows = await fetchAllRows<{ record_type: string; record_id: string; old_value: string | null; new_value: string | null; created_at: string }>(() =>
      sb
        .from("audit_log")
        .select("id, record_type, record_id, old_value, new_value, created_at")
        .in("record_type", ["contract", "client"])
        .eq("action", "status_changed")
        .in("new_value", ["signed", "active"])
        .is("deleted_at", null)
    );
    for (const r of auditRows) {
      if (r.record_type === "contract") {
        if (r.old_value === "signed" || r.old_value === "active") continue; // signed → active: already billable
        keepLatest(becameBillableAt, r.record_id, r.created_at);
      } else if (r.new_value === "active" && r.old_value !== "active") {
        if (r.old_value === "lead") keepLatest(becameBillableAt, `lead:${r.record_id}`, r.created_at);
        else keepLatest(clientReactivatedAt, r.record_id, r.created_at);
      }
    }
  } catch (auditErr) {
    console.error("[contract-invoices] audit trail read failed; catch-up uses created_at/signed_at only:", auditErr);
  }
  const latestDay = (instants: (string | null | undefined)[], tz: string): string | null => {
    let latest: string | null = null;
    for (const instant of instants) {
      if (!instant || Number.isNaN(Date.parse(instant))) continue;
      const day = isoInZone(new Date(instant), tz);
      if (!latest || day > latest) latest = day;
    }
    return latest;
  };

  // Filter to contracts due today for their own billing_frequency (see
  // isBillingDueOn — for `monthly` this is the unchanged day-of-month rule)
  // whose billed cycle falls inside the term (termSkipReason: it starts on/after
  // start_date and on/before end_date — nothing else transitions a contract's
  // status to "expired" automatically when its end_date arrives, so this cron
  // is the only backstop against billing past a lapsed term).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueTodayContracts: any[] = [];
  const orgCanceled = createOrgCanceledResolver(supabase);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((contracts ?? []) as any[])) {
    if (await orgCanceled(c.org_id)) continue; // canceled orgs get no automated invoices
    const { date: todayDate, tz } = await orgToday(c.org_id);
    // Not columns — read by the schedule math (see BillingContractRow): the
    // org's calendar for signed_at/created_at, the late-start invoice date and
    // the reactivation rail.
    c.time_zone = tz;
    c.billable_since = latestDay([c.created_at, c.signed_at, becameBillableAt.get(c.id), becameBillableAt.get(`lead:${c.client_id}`)], tz);
    c.client_active_since = latestDay([clientReactivatedAt.get(c.client_id)], tz);
    // Term vs the BILLED period (advance-shifted), not today — see termSkipReason.
    if (termSkipReason(planContractBilling(c, todayDate, { billNow: false }), c)) continue;
    if (isBillingDueOn(c, todayDate)) dueTodayContracts.push(c);
  }

  const results: { contractId: string; status: "created" | "skipped"; reason?: string }[] = [];

  // ── prorated first-period stubs ───────────────────────────────────────────
  // A contract set to "prorate first period" that starts mid-cycle bills the
  // stub (start date → day before its first regular billing day) as soon as it
  // is signed/active and has started, independent of billing day. Idempotent:
  // the contract's first_period_prorated_at marker, last_billed_date (a full
  // cycle already went out) and any live prorated invoice each block it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const contract of ((contracts ?? []) as any[])) {
    if (contract.start_billing_mode !== "prorate_first_period") continue;
    // A canceled org gets no background invoices — the regular loop skips them, and so must this.
    if (await orgCanceled(contract.org_id)) continue;
    const { str: todayStr } = await orgToday(contract.org_id);
    const stub = planFirstPeriodProration(contract);
    if (!stub || todayStr < stub.periodStart) continue;
    if (contract.end_date && contract.end_date < stub.periodStart) continue;

    const { data: liveStub } = await sb
      .from("crm_invoices")
      .select("id")
      .eq("contract_id", contract.id)
      .not("proration_period_start", "is", null)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (!prorationPending(contract, !!liveStub, stub)) continue;

    const { data: orgTermsRow } = await sb
      .from("organizations")
      .select("default_billing_terms")
      .eq("id", contract.org_id)
      .maybeSingle();
    const stubTerms = resolveInvoiceTerms(contract.clients?.default_terms, orgTermsRow?.default_billing_terms);
    const lineItems = (contract.invoice_line_items ?? []) as string[];
    const baseDescription = lineItems.length > 0 ? lineItems.join("\n") : contract.title;
    const description = `${baseDescription}\n${stub.label}\n${stub.formula}`;

    // Dated the day it is created, like every other invoice — a contract signed after its stub
    // period ended used to get a stub back-dated to that period's last day, born overdue. The
    // per-date unique index covers regular contract invoices only, so this can share a date
    // with that day's regular invoice; crm_invoices_one_prorated_stub_per_contract backstops
    // a second stub.
    const stubInvoiceDate = todayStr;
    const { data: stubInvoice, error: stubErr } = await sb
      .from("crm_invoices")
      .insert({
        org_id: contract.org_id,
        client_id: contract.client_id,
        contract_id: contract.id,
        sales_rep_id: contract.sales_rep_id ?? null,
        description,
        po_number: contract.po_number ?? null,
        invoice_date: stubInvoiceDate,
        terms: stubTerms,
        // Terms run from the (clamped) invoice date, not from today.
        due_date: computeDueDate(stubInvoiceDate, stubTerms),
        status: "draft",
        subtotal_cents: stub.amountCents,
        total_cents: stub.amountCents,
        balance_cents: stub.amountCents,
        proration_period_start: stub.periodStart,
        proration_period_end: stub.periodEnd,
      })
      .select("id")
      .single();
    if (stubErr || !stubInvoice) {
      // 23505 = a live stub already exists (a concurrent manual Create Invoices);
      // the marker isn't set, so tomorrow's run re-checks and skips it.
      results.push({ contractId: contract.id, status: "skipped", reason: stubErr?.message ?? "prorated invoice insert failed" });
      continue;
    }
    const { error: stubLiErr } = await sb.from("crm_invoice_line_items").insert({
      org_id: contract.org_id,
      invoice_id: stubInvoice.id,
      name: stub.label,
      description: `${baseDescription} — ${stub.formula}`,
      qty: 1,
      rate_cents: stub.amountCents,
      total_cents: stub.amountCents,
      is_taxable: false,
      sort_order: 1,
    });
    if (stubLiErr) {
      console.error(`[contract-invoices] prorated line item insert error for contract ${contract.id}:`, stubLiErr);
      await sb.from("crm_invoices").update({ deleted_at: new Date().toISOString() }).eq("id", stubInvoice.id);
      results.push({ contractId: contract.id, status: "skipped", reason: `prorated line item insert failed: ${stubLiErr.message}` });
      continue;
    }
    const { data: stubNumber, error: stubNumErr } = await sb.rpc("assign_invoice_number", { p_invoice_id: stubInvoice.id });
    if (stubNumErr) {
      console.error(`[contract-invoices] prorated invoice number assignment error for contract ${contract.id}:`, stubNumErr);
    }
    const { error: stubActErr } = await sb.from("client_activity").insert({
      org_id: contract.org_id,
      client_id: contract.client_id,
      activity_type: "invoice",
      subject: stubNumber != null ? `Invoice #${stubNumber} (prorated first period)` : "Invoice (prorated first period)",
      amount_cents: stub.amountCents,
      ref_id: stubInvoice.id,
      ref_table: "crm_invoices",
    });
    if (stubActErr) {
      console.error(`[contract-invoices] client activity insert error for contract ${contract.id}:`, stubActErr);
    }
    // Marker only — last_billed_date is left alone so the first REGULAR cycle's
    // catch-up rules aren't suppressed by the stub.
    await sb.from("crm_contracts").update({ first_period_prorated_at: todayStr }).eq("id", contract.id);
    results.push({ contractId: contract.id, status: "created", reason: "prorated first period" });
  }

  if (dueTodayContracts.length === 0) {
    const stubCreated = results.filter((r) => r.status === "created").length;
    return NextResponse.json({ generated: stubCreated, skipped: results.length - stubCreated, results, message: stubCreated ? undefined : "No contracts due today." });
  }

  for (const contract of dueTodayContracts) {
    // ── work out the invoice date and the "already billed" window for THIS
    // contract's frequency. For a monthly contract this returns exactly what
    // the hand-rolled month math here used to: the configured billing day
    // clamped to the (advance-shifted) target month, and that month's first
    // and last day as the window. See src/lib/contract-billing.ts.
    const { date: contractToday } = await orgToday(contract.org_id);
    const plan = planContractBilling(contract, contractToday, { billNow: false });

    // Cheap first pass — for a non-monthly cadence, last_billed_date landing
    // inside this period already proves the period is billed, without a
    // query (and is what makes a one_time contract bill exactly once even if
    // its invoice was later deleted).
    if (billedInPeriod(plan, contract.last_billed_date)) {
      results.push({ contractId: contract.id, status: "skipped", reason: alreadyBilledReason(plan) });
      continue;
    }

    // ── idempotency: skip if an invoice already exists for this contract
    // inside the billing period. one_time has an unbounded window (both
    // bounds null) — any live invoice on the contract at all blocks it.
    // The window is the CYCLE's period (its calendar month / quarter / year),
    // not one invoice date: a late-start invoice dated the day it was created,
    // a manual Create Invoices dated the click day and the billing-day invoice
    // all fall inside it, so whichever came first blocks the others even
    // though their dates differ (the per-date unique index alone wouldn't).
    let existingQuery = sb
      .from("crm_invoices")
      .select("id")
      // Contract only, not client + contract: moving a contract to another
      // client must not make its already-billed period look unbilled.
      .eq("contract_id", contract.id)
      // The prorated first-period stub and a missed-cycles catch-up invoice are
      // separate invoices; neither counts as this period's regular invoice.
      .is("proration_period_start", null)
      .is("catch_up_period_start", null)
      // A source voided by Consolidate Invoices still counts as billed: its charge lives on
      // the consolidated invoice, which carries no contract_id.
      .or("deleted_at.is.null,consolidated_into_id.not.is.null")
      .limit(1);
    if (plan.periodStart) existingQuery = existingQuery.gte("invoice_date", plan.periodStart);
    if (plan.periodEnd) existingQuery = existingQuery.lte("invoice_date", plan.periodEnd);
    let { data: existing } = await existingQuery.maybeSingle();
    // A missed-cycles catch-up invoice whose span holds this cycle also bills it.
    if (!existing && plan.periodStart && plan.periodEnd) {
      const { data: catchUp } = await sb
        .from("crm_invoices")
        .select("id")
        .eq("contract_id", contract.id)
        .not("catch_up_period_start", "is", null)
        .lte("catch_up_period_start", plan.periodEnd)
        .gte("catch_up_period_end", plan.periodStart)
        .or("deleted_at.is.null,consolidated_into_id.not.is.null")
        .limit(1)
        .maybeSingle();
      existing = catchUp;
    }

    if (existing) {
      results.push({ contractId: contract.id, status: "skipped", reason: alreadyBilledReason(plan) });
      continue;
    }

    // ── resolve the amount for this invoice ────────────────────────────────
    // monthly_amount_cents is the PER-INVOICE amount for every frequency, not
    // an annualised figure — an annual contract stores its full yearly price
    // and is billed it once a year. monthly_amounts overrides it by the
    // billing month's key (a seasonal contract billing less in winter).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthlyAmounts = (contract.monthly_amounts ?? {}) as Record<string, number>;
    const monthAmount: number =
      monthlyAmounts[plan.monthKey] != null
        ? monthlyAmounts[plan.monthKey]
        : contract.monthly_amount_cents;

    if (monthAmount <= 0) {
      results.push({ contractId: contract.id, status: "skipped", reason: "zero amount for month" });
      continue;
    }

    // ── description: use invoice_line_items if set, else contract title ───
    const lineItems = (contract.invoice_line_items ?? []) as string[];
    const description = lineItems.length > 0
      ? lineItems.join("\n")
      : contract.title;

    // ── tax ───────────────────────────────────────────────────────────────
    // Contract invoices are untaxed: contracts bill services (typically
    // tax-exempt) and carry no per-service taxable flag. Taxable products are
    // billed through job/visit invoices.
    const totalCents = monthAmount;

    // ── create invoice ────────────────────────────────────────────────────
    // Terms: client default, else org default. due_date is computed so the
    // invoice-past-due cron (which skips null due_date) can fire.
    const { data: orgTermsRow } = await sb
      .from("organizations")
      .select("default_billing_terms")
      .eq("id", contract.org_id)
      .maybeSingle();
    const invoiceTerms = resolveInvoiceTerms(
      contract.clients?.default_terms,
      orgTermsRow?.default_billing_terms,
    );
    const { data: invoice, error: invErr } = await sb
      .from("crm_invoices")
      .insert({
        org_id: contract.org_id,
        client_id: contract.client_id,
        contract_id: contract.id,
        sales_rep_id: contract.sales_rep_id ?? null,
        description,
        // The contract's PO number (selected above, previously dropped) belongs on
        // the invoice the client's AP department matches against.
        po_number: contract.po_number ?? null,
        invoice_date: plan.invoiceDate,
        terms: invoiceTerms,
        due_date: computeDueDate(plan.invoiceDate, invoiceTerms),
        status: "draft",
        subtotal_cents: monthAmount,
        total_cents: totalCents,
        balance_cents: totalCents,
      })
      .select("id")
      .single();

    if (invErr) {
      // 23505 = unique_violation on crm_invoices_one_per_contract_date
      // (contract_id, invoice_date) WHERE deleted_at IS NULL — a concurrent
      // run (manual "Create Invoices" click, or an overlapping cron
      // invocation) already inserted this billing date's invoice between the
      // SELECT check above and this INSERT; report it the same as the
      // pre-existing skip path rather than a raw error.
      //
      // The backstop is per billing DATE, not per month: sub-monthly
      // cadences (weekly/biweekly) can legitimately have several invoices in
      // one calendar month, and it's the period-window SELECT above that
      // keeps a period from being billed twice.
      if (invErr.code === "23505") {
        results.push({ contractId: contract.id, status: "skipped", reason: alreadyBilledReason(plan) });
        continue;
      }
      console.error(`[contract-invoices] invoice insert error for contract ${contract.id}:`, invErr);
      results.push({ contractId: contract.id, status: "skipped", reason: invErr.message });
      continue;
    }

    // ── create a line item row on the invoice ─────────────────────────────
    // org_id must be set explicitly: the column's default reads it off
    // auth.uid() via my_org_id(), which is null under this route's
    // service-role session, so omitting it here silently fails the insert
    // (NOT NULL violation) and leaves the invoice with zero line items.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: liErr } = await (sb as any).from("crm_invoice_line_items").insert({
      org_id: contract.org_id,
      invoice_id: invoice.id,
      // Same as the manual "Create Invoices" path (use-contracts.ts): the line
      // names the contract's configured service(s), not the contract's own
      // title — matching the invoice header description above.
      name: lineItems.length > 0 ? lineItems.join(", ") : contract.title,
      description,
      qty: 1,
      rate_cents: monthAmount,
      total_cents: monthAmount,
      is_taxable: false,
      sort_order: 1,
    });

    if (liErr) {
      console.error(`[contract-invoices] line item insert error for contract ${contract.id}:`, liErr);
      // Soft-delete the line-item-less invoice: left live, the idempotency
      // check above would see it next run and skip this contract's period
      // forever, leaving the client unbilled.
      const { error: orphanErr } = await sb
        .from("crm_invoices")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", invoice.id);
      if (orphanErr) {
        console.error(`[contract-invoices] failed to soft-delete orphan invoice ${invoice.id}:`, orphanErr);
      }
      results.push({ contractId: contract.id, status: "skipped", reason: `line item insert failed: ${liErr.message}` });
      continue;
    }

    // ── assign the invoice number now that it's fully populated ────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: invoiceNumber, error: numErr } = await (sb as any).rpc("assign_invoice_number", { p_invoice_id: invoice.id });
    if (numErr) {
      console.error(`[contract-invoices] invoice number assignment error for contract ${contract.id}:`, numErr);
    }

    // ── log to the client's activity timeline ─────────────────────────────
    // Same pattern as useAssignInvoiceNumber; org_id explicit for the same
    // service-role reason as the line item above.
    const { error: activityErr } = await sb.from("client_activity").insert({
      org_id: contract.org_id,
      client_id: contract.client_id,
      activity_type: "invoice",
      subject: invoiceNumber != null ? `Invoice #${invoiceNumber}` : "Invoice",
      amount_cents: totalCents,
      ref_id: invoice.id,
      ref_table: "crm_invoices",
    });
    if (activityErr) {
      console.error(`[contract-invoices] client activity insert error for contract ${contract.id}:`, activityErr);
    }

    // ── update last_billed_date (and pin a quarterly/annual grid) ─────────
    const anchorStamp = billingAnchorStamp(contract, plan);
    await sb
      .from("crm_contracts")
      .update({ last_billed_date: plan.invoiceDate, ...(anchorStamp ? { billing_anchor_date: anchorStamp } : {}) })
      .eq("id", contract.id);

    results.push({ contractId: contract.id, status: "created" });
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.info(
    `[contract-invoices] ${now.toISOString()} — ${dueTodayContracts.length} due across ` +
    `${orgTodayCache.size} org(s) [${[...orgTodayCache.values()].map((v) => `${v.str} (${ordinal(v.date.getDate())})`).join(", ")}]: ` +
    `${created} created, ${skipped} skipped`
  );

  return NextResponse.json({ generated: created, skipped, results });
}
