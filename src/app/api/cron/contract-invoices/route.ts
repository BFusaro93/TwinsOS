import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  alreadyBilledReason,
  billedInPeriod,
  isBillingDueOn,
  planContractBilling,
} from "@/lib/contract-billing";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone, todayInZoneAsLocalMidnight } from "@/lib/time/zone";

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
 *     getting invoiced forever)
 *   - start_date is null or has already arrived, and end_date is null or
 *     hasn't passed yet (nothing else transitions status to "expired" when
 *     end_date arrives, so this is the only thing stopping billing past term)
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
  const orgTodayCache = new Map<string, { str: string; date: Date }>();
  async function orgToday(orgId: string): Promise<{ str: string; date: Date }> {
    let hit = orgTodayCache.get(orgId);
    if (!hit) {
      const tz = await getOrgTimeZone(supabase, orgId);
      hit = { str: todayInZone(tz), date: todayInZoneAsLocalMidnight(tz) };
      orgTodayCache.set(orgId, hit);
    }
    return hit;
  }

  // ── fetch candidates ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: contracts, error: fetchErr } = await sb
    .from("crm_contracts")
    .select("id, org_id, client_id, title, status, start_date, end_date, billing_day_of_month, billing_frequency, last_billed_date, signed_at, created_at, monthly_amount_cents, monthly_amounts, invoice_line_items, bill_month_in_advance, payment_type, po_number, sales_rep_id, clients!inner(deleted_at)")
    .is("clients.deleted_at", null)
    .eq("is_active", true)
    .eq("auto_generate", true)
    // Only a contract the client has actually agreed to should be auto-billed.
    // is_active/auto_generate alone aren't enough to gate this: both default
    // to true on a brand-new contract, so a still-"draft"/"sent" (never
    // signed) contract — or one the office marked "cancelled"/"expired" —
    // would otherwise be picked up here the moment its billing day rolls
    // around, since nothing else in this query looks at status at all.
    .in("status", ["signed", "active"])
    .is("deleted_at", null);

  if (fetchErr) {
    console.error("[contract-invoices] fetch error:", fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Filter to contracts due today for their own billing_frequency (see
  // isBillingDueOn — for `monthly` this is the unchanged day-of-month rule),
  // that have actually started, and whose end_date (if any) hasn't passed —
  // nothing else transitions a contract's status to "expired" automatically
  // when its end_date arrives, so this cron is the only backstop against
  // billing past a lapsed term.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueTodayContracts: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of ((contracts ?? []) as any[])) {
    const { str: todayStr, date: todayDate } = await orgToday(c.org_id);
    if (c.start_date && c.start_date > todayStr) continue;
    if (c.end_date && c.end_date < todayStr) continue;
    if (isBillingDueOn(c, todayDate)) dueTodayContracts.push(c);
  }

  if (dueTodayContracts.length === 0) {
    return NextResponse.json({ generated: 0, message: "No contracts due today." });
  }

  const results: { contractId: string; status: "created" | "skipped"; reason?: string }[] = [];

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
    let existingQuery = sb
      .from("crm_invoices")
      .select("id")
      .eq("client_id", contract.client_id)
      .eq("contract_id", contract.id)
      .is("deleted_at", null)
      .limit(1);
    if (plan.periodStart) existingQuery = existingQuery.gte("invoice_date", plan.periodStart);
    if (plan.periodEnd) existingQuery = existingQuery.lte("invoice_date", plan.periodEnd);
    const { data: existing } = await existingQuery.maybeSingle();

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

    // ── create invoice ────────────────────────────────────────────────────
    const { data: invoice, error: invErr } = await sb
      .from("crm_invoices")
      .insert({
        org_id: contract.org_id,
        client_id: contract.client_id,
        contract_id: contract.id,
        sales_rep_id: contract.sales_rep_id ?? null,
        description,
        invoice_date: plan.invoiceDate,
        due_date: null,
        status: "draft",
        subtotal_cents: monthAmount,
        total_cents: monthAmount,
        balance_cents: monthAmount,
      })
      .select("id")
      .single();

    if (invErr) {
      // 23505 = unique_violation on crm_invoices_one_per_contract_month — a
      // concurrent run (manual "Create Invoices" click, or an overlapping
      // cron invocation) already inserted this month's invoice between the
      // SELECT check above and this INSERT; report it the same as the
      // pre-existing skip path rather than a raw error.
      //
      // That index is keyed on (contract_id, year, month), so it is ALSO
      // what a weekly/biweekly contract hits on its second invoice of a
      // calendar month. Until the index is re-keyed on
      // (contract_id, invoice_date), sub-monthly cadences are capped at one
      // invoice per month — an under-bill, not an over-bill.
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
      name: contract.title,
      description: contract.title,
      qty: 1,
      rate_cents: monthAmount,
      total_cents: monthAmount,
      sort_order: 1,
    });

    if (liErr) {
      console.error(`[contract-invoices] line item insert error for contract ${contract.id}:`, liErr);
      results.push({ contractId: contract.id, status: "skipped", reason: `line item insert failed: ${liErr.message}` });
      continue;
    }

    // ── assign the invoice number now that it's fully populated ────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: numErr } = await (sb as any).rpc("assign_invoice_number", { p_invoice_id: invoice.id });
    if (numErr) {
      console.error(`[contract-invoices] invoice number assignment error for contract ${contract.id}:`, numErr);
    }

    // ── update last_billed_date ───────────────────────────────────────────
    await sb
      .from("crm_contracts")
      .update({ last_billed_date: plan.invoiceDate })
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
