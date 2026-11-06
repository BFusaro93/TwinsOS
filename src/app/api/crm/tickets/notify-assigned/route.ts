import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { notifyTicketsAssignedBulk } from "@/lib/ticket-notify";
import { chunk } from "@/lib/utils/chunk";

/**
 * POST /api/crm/tickets/notify-assigned — one assignment notice per assignee for a
 * bulk reassign. TicketsList's "Reassign" used to fire /tickets/[id]/notify per
 * ticket, so moving 40 tickets sent the assignee 40 emails and 40 bell rows.
 * Body: { ticketIds: string[] } — only tickets in the caller's org whose
 * assignment was just written (same freshness window as the per-ticket route).
 */

const NOTIFY_WINDOW_MS = 10 * 60 * 1000;

const bodySchema = z.object({ ticketIds: z.array(z.string().uuid()).min(1).max(1000) });

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: hasCrmAccess } = await supabase.rpc("has_crm_access");
  if (!hasCrmAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgId = await getEffectiveOrgId(supabase);
  if (!orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "ticketIds required" }, { status: 400 });

  if (!(await checkAuthRateLimit(`ticket-assigned-bulk:${user.id}`, 5, 600))) {
    return NextResponse.json({ error: "Too many reassignments announced — try again shortly" }, { status: 429 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  type Row = { id: string; ticket_number: number; subject: string | null; assigned_to: string | null; assigned_to_id: string | null; updated_at: string | null };
  const rows: Row[] = [];
  for (const ids of chunk(Array.from(new Set(parsed.data.ticketIds)), 100)) {
    const { data, error } = await admin
      .from("crm_tickets")
      .select("id, ticket_number, subject, assigned_to, assigned_to_id, updated_at")
      .in("id", ids)
      .eq("org_id", orgId)
      .is("deleted_at", null);
    if (error) return NextResponse.json({ error: "Couldn't load the tickets" }, { status: 500 });
    rows.push(...((data ?? []) as Row[]));
  }

  // Only announce assignments that were just made, grouped per assignee.
  const cutoff = Date.now() - NOTIFY_WINDOW_MS;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.updated_at || new Date(r.updated_at).getTime() < cutoff) continue;
    if (!r.assigned_to_id && !r.assigned_to) continue;
    const key = r.assigned_to_id ?? `name:${r.assigned_to}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  for (const group of groups.values()) {
    await notifyTicketsAssignedBulk(admin, {
      orgId,
      tickets: group.map((r) => ({ ticketId: r.id, ticketNumber: r.ticket_number, subject: r.subject })),
      assignedToId: group[0].assigned_to_id,
      assignedToName: group[0].assigned_to,
      assignedByUserId: user.id,
    });
  }

  return NextResponse.json({ notified: groups.size });
}
