import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

/**
 * GET /api/cron/invoice-past-due — called daily by Vercel Cron.
 *
 * Fires the 'invoice_past_due' automation trigger for every invoice that's
 * still owed and whose due date has passed. Re-entry/eligibility dedup is
 * handled entirely by fireSimpleTrigger/isEligibleForEnrollment — running
 * this daily is expected and safe, same as the estimate date-gap crons.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // "Past due" is relative to each org's own day, so this can't be one SQL
  // bound any more. UTC is at or ahead of every US zone, so filtering on the
  // UTC date is a superset — it can over-select by a day, never under-select.
  // Each row is then re-checked against its own org's today below.
  const utcToday = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdue } = await (supabase as any)
    .from("crm_invoices")
    .select("id, org_id, client_id, due_date")
    .not("due_date", "is", null)
    .lt("due_date", utcToday)
    .not("status", "in", '("paid","void","draft")')
    .is("deleted_at", null);

  let fired = 0;
  for (const invoice of (overdue ?? []) as { id: string; org_id: string; client_id: string; due_date: string }[]) {
    // Re-check on the owning org's calendar: an invoice due today is not past
    // due, and the UTC-bounded query above may have included one.
    const orgToday = todayInZone(await getOrgTimeZone(supabase, invoice.org_id));
    if (!(invoice.due_date < orgToday)) continue;
    await fireSimpleTrigger(supabase, {
      orgId: invoice.org_id,
      clientId: invoice.client_id,
      invoiceId: invoice.id,
      triggerType: "invoice_past_due",
    });
    fired++;
  }

  return NextResponse.json({ checked: fired });
}
