import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { notifyVisitAssigned } from "@/lib/notifications/visit-notify";
import { formatMonthDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

const log = logger.child("crew/hand-off");

const Body = z.object({ crewId: z.string().uuid() });

/**
 * Crew B can't make it to a stop: hands it to crew A before starting it. The
 * stop moves to A (dispatched, so it is on A's tablet at once) and drops off B's.
 * crm_crew_hand_off_stop does the work as the caller — it refuses anyone who
 * isn't a crew login on that stop, a stop already started, and a multi-crew stop.
 * Same visit, so billing is untouched. A client-timeline row records who handed
 * what to whom.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { visitId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const db = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: before } = await (db as any)
    .from("crm_job_visits")
    .select("org_id, client_id, job_id, scheduled_date, start_time")
    .eq("id", visitId)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const readOnly = await assertOrgWritable(db, before.org_id);
  if (readOnly) return readOnly;

  // The asking crew's name, read BEFORE the move (afterwards the visit isn't theirs).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: crewRows } = await (db as any)
    .from("crm_crews")
    .select("id, name, user_id")
    .eq("org_id", before.org_id)
    .or(`id.eq.${parsed.data.crewId},user_id.eq.${user.id}`);
  const rows = (crewRows ?? []) as { id: string; name: string; user_id: string | null }[];
  const target = rows.find((c) => c.id === parsed.data.crewId)?.name ?? "another crew";
  const asking = rows.find((c) => c.user_id === user.id && c.id !== parsed.data.crewId)?.name ?? "A crew";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("crm_crew_hand_off_stop", {
    p_visit_id: visitId,
    p_crew_id: parsed.data.crewId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  void notifyVisitAssigned({
    visitId,
    crewId: parsed.data.crewId,
    clientId: (before.client_id as string | undefined) ?? undefined,
    scheduledDate: (before.scheduled_date as string | undefined) ?? null,
    startTime: (before.start_time as string | undefined) ?? null,
  });

  if (before.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: actErr } = await (db as any).from("client_activity").insert({
      org_id: before.org_id,
      client_id: before.client_id,
      activity_type: "job",
      subject: `${asking} handed off to ${target} ${formatMonthDay(before.scheduled_date as string)}`,
      ref_id: before.job_id,
      ref_table: "crm_jobs",
      created_by: user.id,
      occurred_at: new Date().toISOString(),
    });
    if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
  }

  return NextResponse.json({ visitId, crewName: target });
}
