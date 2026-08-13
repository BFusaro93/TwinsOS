import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

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

  const todayStr = new Date().toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: overdue } = await (supabase as any)
    .from("crm_invoices")
    .select("id, org_id, client_id")
    .not("due_date", "is", null)
    .lt("due_date", todayStr)
    .not("status", "in", '("paid","void","draft")')
    .is("deleted_at", null);

  let fired = 0;
  for (const invoice of (overdue ?? []) as { id: string; org_id: string; client_id: string }[]) {
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
