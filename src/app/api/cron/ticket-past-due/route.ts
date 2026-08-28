import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

/**
 * GET /api/cron/ticket-past-due — called daily by Vercel Cron.
 *
 * Fires the 'ticket_past_due' automation trigger for every open or pending
 * ticket whose due date has passed. on_hold tickets are excluded — a ticket
 * on hold is deliberately paused, not overdue. Tickets with no client_id
 * (internal-only tickets) have nothing to enroll and are skipped —
 * automations are always client-scoped.
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
    .from("crm_tickets")
    .select("id, org_id, client_id")
    .not("due_date", "is", null)
    .lt("due_date", todayStr)
    .in("status", ["open", "pending"])
    .not("client_id", "is", null)
    .is("deleted_at", null);

  let fired = 0;
  for (const ticket of (overdue ?? []) as { id: string; org_id: string; client_id: string }[]) {
    await fireSimpleTrigger(supabase, {
      orgId: ticket.org_id,
      clientId: ticket.client_id,
      ticketId: ticket.id,
      triggerType: "ticket_past_due",
    });
    fired++;
  }

  return NextResponse.json({ checked: fired });
}
