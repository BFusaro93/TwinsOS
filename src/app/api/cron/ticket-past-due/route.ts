import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOrgTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { createOrgOutboundMutedResolver } from "@/lib/orgs/org-canceled";

/**
 * GET /api/cron/ticket-past-due — called daily by Vercel Cron.
 *
 * Fires the 'ticket_past_due' automation trigger for every open or pending
 * ticket whose due date has passed. on_hold tickets are excluded — a ticket
 * on hold is deliberately paused, not overdue. Tickets with no client_id
 * (internal-only tickets) have nothing to enroll and are skipped —
 * automations are always client-scoped.
 */
// Many orgs × many rows, each firing a trigger lookup + enrollment: give the
// run the full Pro-plan budget instead of the default.
export const maxDuration = 300;

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

  // Page through the results — a single select silently truncates at 1000 rows.
  type Row = { id: string; org_id: string; client_id: string; due_date: string };
  const overdue: Row[] = [];
  for (let from = 0; ; ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page, error } = await (supabase as any)
      .from("crm_tickets")
      .select("id, org_id, client_id, due_date")
      .not("due_date", "is", null)
      .lt("due_date", utcToday)
      .in("status", ["open", "pending"])
      .not("client_id", "is", null)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!page || page.length === 0) break;
    overdue.push(...(page as Row[]));
    from += page.length;
  }

  // Group by org: the org's calendar day is resolved once per org, and an org
  // with no active ticket_past_due trigger is skipped outright instead of paying a
  // trigger lookup per overdue row.
  const byOrg = new Map<string, Row[]>();
  for (const row of overdue) {
    const list = byOrg.get(row.org_id);
    if (list) list.push(row);
    else byOrg.set(row.org_id, [row]);
  }

  let fired = 0;
  let stoppedEarly = false;
  const startedAt = Date.now();
  const orgCanceled = createOrgOutboundMutedResolver(supabase);
  // Start at a different org each day and stop before maxDuration: each overdue row costs
  // several queries, so one org with thousands of them could use up every run and the orgs
  // after it in a fixed order were never reached.
  const orgIds = [...byOrg.keys()].sort();
  const offset = orgIds.length ? Math.floor(startedAt / 86_400_000) % orgIds.length : 0;
  outer: for (const orgId of [...orgIds.slice(offset), ...orgIds.slice(0, offset)]) {
    const rows = byOrg.get(orgId) ?? [];
    if (await orgCanceled(orgId)) continue; // canceled orgs get no automated reminders
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: triggerCount } = await (supabase as any)
      .from("crm_sequence_triggers")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("trigger_type", "ticket_past_due");
    if (!triggerCount) continue;
    // Loaded once per org rather than once per overdue row.
    const orgTriggers = await fetchOrgTriggers(supabase, orgId, "ticket_past_due");

    const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));
    // Rows come back id-ordered; start at a different row each day too, so an org with more
    // rows than one run can handle doesn't skip the same tail every day.
    const rowOffset = rows.length ? Math.floor(startedAt / 86_400_000) % rows.length : 0;
    for (const ticket of [...rows.slice(rowOffset), ...rows.slice(0, rowOffset)]) {
      if (Date.now() - startedAt > 270_000) { stoppedEarly = true; break outer; }
      // Re-check on the owning org's calendar: a row due today is not past
      // due, and the UTC-bounded query above may have included one.
      if (!(ticket.due_date < orgToday)) continue;
      await fireSimpleTrigger(supabase, {
        orgId,
        clientId: ticket.client_id,
        ticketId: ticket.id,
        triggerType: "ticket_past_due",
      }, orgTriggers);
      fired++;
    }
  }

  return NextResponse.json({ checked: fired, stoppedEarly });
}
