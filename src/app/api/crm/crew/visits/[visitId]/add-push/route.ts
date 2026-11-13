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
 * once-per-storm jobs record it at $0 (isUnbilledExtraPush).
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
    .from("crm_job_visits")
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastRow } = await (db as any)
    .from("crm_job_visits")
    .select("push_number, status")
    .eq("job_id", source.job_id)
    .eq("storm_event_id", source.storm_event_id)
    .is("deleted_at", null)
    .order("push_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastPush = Number(lastRow?.push_number ?? source.push_number ?? 1) || 1;
  // A push already waiting or running for this job — don't stack a second one.
  if (lastRow && ["scheduled", "dispatched", "in_progress"].includes(lastRow.status)) {
    return NextResponse.json({ error: "Another push is already open for this stop — it's on your list." }, { status: 409 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: maxRow } = await (db as any)
    .from("crm_job_visits")
    .select("order_num")
    .eq("storm_event_id", source.storm_event_id)
    .is("deleted_at", null)
    .not("order_num", "is", null)
    .order("order_num", { ascending: false })
    .limit(1)
    .maybeSingle();

  const tz = await getOrgTimeZone(db, source.org_id);
  const today = todayInZone(tz);
  const row = {
    org_id: source.org_id,
    job_id: source.job_id,
    client_id: source.client_id,
    scheduled_date: source.scheduled_date > today ? source.scheduled_date : today,
    men_count: Math.max(1, Number(source.men_count) || 1),
    crew_id: source.crew_id ?? null,
    crew_unassigned: source.crew_unassigned ?? false,
    notes_to_crew: source.notes_to_crew ?? null,
    storm_event_id: source.storm_event_id,
    order_num: maxRow?.order_num != null ? Number(maxRow.order_num) + 1 : 0,
    // Dispatched: a crew only sees dispatched work, and they are on site now.
    status: "dispatched",
    created_by: user.id,
  };

  // Two taps at once lose the unique (job, storm, push) race with 23505 — take the next number.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const pushNumber = lastPush + attempt;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from("crm_job_visits")
      .insert({ ...row, push_number: pushNumber })
      .select("id, push_number")
      .single();
    if (!error) {
      if (source.client_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: actErr } = await (db as any).from("client_activity").insert({
          org_id: source.org_id,
          client_id: source.client_id,
          activity_type: "job",
          subject: `Snow push ${pushNumber} added ${formatMonthDay(row.scheduled_date)} (crew)`,
          ref_id: source.job_id,
          ref_table: "crm_jobs",
          created_by: user.id,
          occurred_at: new Date().toISOString(),
        });
        if (actErr) log.error("activity insert failed", { visitId, error: actErr.message });
      }
      return NextResponse.json({ id: data.id, pushNumber });
    }
    if ((error as { code?: string }).code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Another push was just added — refresh and try again." }, { status: 409 });
}
