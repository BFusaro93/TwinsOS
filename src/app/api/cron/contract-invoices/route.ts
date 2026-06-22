import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/**
 * GET /api/cron/contract-invoices — called daily by Vercel Cron at 08:00 UTC
 *
 * For every active contract where:
 *   - is_active = true
 *   - auto_generate = true
 *   - billing_day_of_month = today's day-of-month (or last day of month if
 *     billing_day > days in current month)
 *   - no invoice already exists for this contract in the current billing month
 *
 * Creates a crm_invoices row using the per-month amount from monthly_amounts
 * (falls back to monthly_amount_cents if the month key is absent), then
 * updates last_billed_date on the contract.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 * Reject anything else.
 */

const MONTH_KEYS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;

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
  const todayDay = now.getDate();
  const currentMonthKey = MONTH_KEYS[now.getMonth()];
  // ISO date string for the first day of the current month — used to check
  // whether an invoice for this contract was already generated this month.
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
  // Last day of current month — contracts with billing_day > month length
  // fire on the last day.
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // ── fetch candidates ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;

  const { data: contracts, error: fetchErr } = await sb
    .from("crm_contracts")
    .select("id, org_id, client_id, title, billing_day_of_month, monthly_amount_cents, monthly_amounts, invoice_line_items, bill_month_in_advance, payment_type, po_number")
    .eq("is_active", true)
    .eq("auto_generate", true)
    .is("deleted_at", null);

  if (fetchErr) {
    console.error("[contract-invoices] fetch error:", fetchErr);
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  // Filter to contracts whose billing day matches today (or last day of month
  // when billing_day > days in current month).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dueTodayContracts = ((contracts ?? []) as any[]).filter((c) => {
    const effectiveDay = c.billing_day_of_month > lastDayOfMonth
      ? lastDayOfMonth
      : c.billing_day_of_month;
    return effectiveDay === todayDay;
  });

  if (dueTodayContracts.length === 0) {
    return NextResponse.json({ generated: 0, message: "No contracts due today." });
  }

  // ── determine billing month (advance billing shifts by one month) ──────────
  // For "bill month in advance" contracts we still run on the billing day but
  // label the invoice for the next calendar month.
  const invoiceDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;

  const results: { contractId: string; status: "created" | "skipped"; reason?: string }[] = [];

  for (const contract of dueTodayContracts) {
    // ── idempotency: skip if invoice already exists for this contract this month
    const { data: existing } = await sb
      .from("crm_invoices")
      .select("id")
      .eq("client_id", contract.client_id)
      .eq("contract_id", contract.id)
      .gte("invoice_date", monthStart)
      .lte("invoice_date", monthEnd)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (existing) {
      results.push({ contractId: contract.id, status: "skipped", reason: "already billed this month" });
      continue;
    }

    // ── resolve amount for this month ─────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monthlyAmounts = (contract.monthly_amounts ?? {}) as Record<string, number>;
    const monthAmount: number =
      monthlyAmounts[currentMonthKey] != null
        ? monthlyAmounts[currentMonthKey]
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
        description,
        invoice_date: invoiceDateStr,
        due_date: null,
        status: "draft",
        subtotal_cents: monthAmount,
        total_cents: monthAmount,
      })
      .select("id")
      .single();

    if (invErr) {
      console.error(`[contract-invoices] invoice insert error for contract ${contract.id}:`, invErr);
      results.push({ contractId: contract.id, status: "skipped", reason: invErr.message });
      continue;
    }

    // ── create a line item row on the invoice ─────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
await (sb as any).from("crm_invoice_line_items").insert({
      invoice_id: invoice.id,
      description: contract.title,
      qty: 1,
      rate_cents: monthAmount,
      total_cents: monthAmount,
      sort_order: 1,
    });

    // ── update last_billed_date ───────────────────────────────────────────
    await sb
      .from("crm_contracts")
      .update({ last_billed_date: invoiceDateStr })
      .eq("id", contract.id);

    results.push({ contractId: contract.id, status: "created" });
  }

  const created = results.filter((r) => r.status === "created").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.info(`[contract-invoices] ${now.toISOString()} — day ${todayDay} (${ordinal(todayDay)}): ${created} created, ${skipped} skipped`);

  return NextResponse.json({ generated: created, skipped, results });
}
