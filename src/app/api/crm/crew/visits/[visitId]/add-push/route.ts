import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { assertOrgWritable } from "@/lib/org-writable";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { formatMonthDay } from "@/lib/utils";
import { logger } from "@/lib/logger";

const log = logger.child("crew/add-push");

/**
 * The crew is going back to a site on a storm they already finished (a 2-4"
 * pass that isn't the final push). Creates the job's next push as its own
 * visit — already dispatched, so it shows on the crew's list straight away —
 * and writes a client-timeline row so every return trip is on record.
 *
 * Billing is decided elsewhere: Per Push / Hourly bill the new visit,
 * once-per-storm jobs record it at $0 — except a Per Event Per Inch storm in an
 * hourly depth range, where the return trip's hours bill (isUnbilledSnowVisit).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: source } = await (supabase as any)
    .from("crm_crew_job_visits")
    .select("org_id, job_id, client_id, crew_id, crew_unassigned, men_count, notes_to_crew, storm_event_id, push_number, scheduled_date, status, crm_jobs:crew_job(crew_id, job_type)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, source.org_id, source))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  if (!source.storm_event_id || source.crm_jobs?.job_type !== "snow") {
    return NextResponse.json({ error: "Only a snow storm visit can get another push." }, { status: 400 });
  }
  if (source.status !== "completed") {
    return NextResponse.json({ error: "Finish this stop before adding another push." }, { status: 409 });
  }

  const db = createServiceClient();
  const readOnly = await assertOrgWritable(db, source.org_id);
  if (readOnly) return readOnly;

  const tz = await getOrgTimeZone(db, source.org_id);
  const today = todayInZone(tz);
  const scheduledDate = source.scheduled_date > today ? source.scheduled_date : today;

  // Check "is a push already open?" and insert the next push in ONE locked RPC: two
  // crews tapping Add Push at once get one new push; the other tap is refused (409).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.rpc as any)("crm_add_snow_push", {
    p_source_visit_id: visitId,
    p_scheduled_date: scheduledDate,
    p_created_by: user.id,
  });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "PT409" || code === "23505") {
      return NextResponse.json(
        { error: code === "PT409" && error.message ? error.message : "Another push is already open for this stop — it's on your list." },
        { status: 409 }
      );
    }
    if (code === "22023" || code === "P0002") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    log.error("add push failed", { visitId, error: error.message });
    return NextResponse.json({ error: "Couldn't add the push — try again." }, { status: 500 });
  }
  const created = data as { id: string; push_number: number };
  const pushNumber = Number(created.push_number);
  if (source.client_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: actErr } = await (db as any).from("client_activity").insert({
      org_id: source.org_id,
      client_id: source.client_id,
      activity_type: "job",
      subject: `Snow push ${pushNumber} added ${formatMonthDay(scheduledDate)} (crew)`,
      ref_id: source.job_id,
      ref_table: "crm_jobs",
      created_by: user.id,
      occurred_at: new Date().toISOString(),
    });
    if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
  }
  return NextResponse.json({ id: created.id, pushNumber });
}
