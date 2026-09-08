import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { stopKeyForVisit, type StopKeyInput } from "@/lib/utils/visit-stops";
import { assertCallerOwnsVisit } from "@/lib/supabase/route-auth";

interface VisitRow {
  id: string;
  org_id: string;
  client_id: string;
  scheduled_date: string;
  crew_id: string | null;
  status: string;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  paused_at: string | null;
  break_minutes: number | null;
  crm_jobs: { property_id: string | null; service_address: string | null; service_city: string | null } | null;
}

function toStopKeyInput(row: VisitRow): StopKeyInput {
  return {
    clientId: row.client_id,
    scheduledDate: row.scheduled_date,
    crewId: row.crew_id,
    job: row.crm_jobs
      ? { propertyId: row.crm_jobs.property_id, serviceAddress: row.crm_jobs.service_address, serviceCity: row.crm_jobs.service_city }
      : undefined,
  };
}

const VISIT_SELECT = "id, org_id, client_id, scheduled_date, crew_id, status, clocked_in_at, clocked_out_at, paused_at, break_minutes, crm_jobs(property_id, service_address, service_city)";

/**
 * Resumes every paused visit in this stop — rolls the elapsed break time
 * into break_minutes (accumulated across possibly multiple pauses) and
 * clears paused_at. Status/clocked_in_at are untouched: to the rest of the
 * system the visit was "in_progress" the whole time, it just wasn't
 * accruing billable/actual time while paused (see the stop clock-out route,
 * which subtracts break_minutes from the measured duration).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId: anchorVisitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anchorRow, error: anchorErr } = await (supabase as any)
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("id", anchorVisitId)
    .is("deleted_at", null)
    .single();
  if (anchorErr || !anchorRow) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const anchor = anchorRow as VisitRow;

  if (!(await assertCallerOwnsVisit(supabase, user.id, anchor.org_id, anchor.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidateRows, error: candErr } = await (supabase as any)
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("client_id", anchor.client_id)
    .eq("scheduled_date", anchor.scheduled_date)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,skipped)");
  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });

  const anchorKey = stopKeyForVisit(toStopKeyInput(anchor));
  const pausedRows = (candidateRows as VisitRow[])
    .filter((r) => r.crew_id === anchor.crew_id)
    .filter((r) => stopKeyForVisit(toStopKeyInput(r)) === anchorKey)
    .filter((r) => r.clocked_in_at && !r.clocked_out_at && r.paused_at);

  if (pausedRows.length === 0) {
    return NextResponse.json({ error: "Nothing to resume for this stop" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updateErrors: string[] = [];
  for (const row of pausedRows) {
    const pauseMinutes = Math.max(0, Math.round(
      (new Date(now).getTime() - new Date(row.paused_at as string).getTime()) / 60_000
    ));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("crm_job_visits")
      .update({
        paused_at: null,
        break_minutes: (row.break_minutes ?? 0) + pauseMinutes,
        updated_at: now,
      })
      .eq("id", row.id);
    if (error) updateErrors.push(`${row.id}: ${error.message}`);
  }
  if (updateErrors.length > 0) {
    return NextResponse.json({ error: `Failed to resume: ${updateErrors.join("; ")}` }, { status: 500 });
  }

  const ids = pausedRows.map((r) => r.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: finalRows } = await (supabase as any)
    .from("crm_job_visits")
    .select()
    .in("id", ids);

  return NextResponse.json({ visitIds: ids, visits: finalRows });
}
