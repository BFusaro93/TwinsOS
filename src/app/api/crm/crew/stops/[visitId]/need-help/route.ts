import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { notifyVisitAssigned } from "@/lib/notifications/visit-notify";
import { formatMonthDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

const log = logger.child("crew/need-help");

const Body = z.object({ crewId: z.string().uuid() });

/**
 * Crew B needs help and calls crew A: adds crew A to the stop as an extra crew,
 * dispatched straight to A's tablet (no office step). The database function
 * crm_crew_request_help does the work as the caller — it refuses anyone who
 * isn't a crew login on that stop — and creates A's own visit. Billing is
 * unchanged: the lead carries the charge; extras bill only on Hourly jobs.
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
  const { data: orgRow } = await (db as any).from("crm_job_visits").select("org_id").eq("id", visitId).maybeSingle();
  if (!orgRow) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const readOnly = await assertOrgWritable(db, orgRow.org_id);
  if (readOnly) return readOnly;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newVisitId, error } = await (supabase as any).rpc("crm_crew_request_help", {
    p_visit_id: visitId,
    p_crew_id: parsed.data.crewId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created } = await (db as any)
    .from("crm_job_visits")
    .select("client_id, job_id, scheduled_date, start_time, org_id")
    .eq("id", newVisitId)
    .maybeSingle();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: crewRows } = await (db as any)
    .from("crm_crews")
    .select("id, name, user_id")
    .eq("org_id", orgRow.org_id)
    .or(`id.eq.${parsed.data.crewId},user_id.eq.${user.id}`);
  const rows = (crewRows ?? []) as { id: string; name: string; user_id: string | null }[];
  const helper = rows.find((c) => c.id === parsed.data.crewId)?.name ?? "another crew";
  const asking = rows.find((c) => c.user_id === user.id && c.id !== parsed.data.crewId)?.name ?? "A crew";

  // Push to the helping crew: same notification a normal assignment sends.
  void notifyVisitAssigned({
    visitId: newVisitId as string,
    crewId: parsed.data.crewId,
    clientId: (created?.client_id as string | undefined) ?? undefined,
    scheduledDate: (created?.scheduled_date as string | undefined) ?? null,
    startTime: (created?.start_time as string | undefined) ?? null,
  });

  // Client timeline: who was on site.
  if (created?.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: actErr } = await (db as any).from("client_activity").insert({
      org_id: orgRow.org_id,
      client_id: created.client_id,
      activity_type: "job",
      subject: `${asking} called in ${helper} to help ${formatMonthDay(created.scheduled_date as string)}`,
      ref_id: created.job_id,
      ref_table: "crm_jobs",
      created_by: user.id,
      occurred_at: new Date().toISOString(),
    });
    if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
  }

  return NextResponse.json({ visitId: newVisitId, crewName: helper });
}
