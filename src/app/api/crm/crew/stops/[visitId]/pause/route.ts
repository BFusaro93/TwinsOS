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

const VISIT_SELECT = "id, org_id, client_id, scheduled_date, crew_id, status, clocked_in_at, clocked_out_at, paused_at, crm_jobs(property_id, service_address, service_city)";

/**
 * Pauses every open visit in this stop (lunch, stopping for the day) without
 * completing or billing it — sets paused_at, leaves status/clocked_in_at
 * untouched so resume can pick the visit back up. Mirrors the sibling-set
 * derivation in clock-in/clock-out.
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
  const openIds = (candidateRows as VisitRow[])
    .filter((r) => r.crew_id === anchor.crew_id)
    .filter((r) => stopKeyForVisit(toStopKeyInput(r)) === anchorKey)
    .filter((r) => r.clocked_in_at && !r.clocked_out_at && !r.paused_at)
    .map((r) => r.id);

  if (openIds.length === 0) {
    return NextResponse.json({ error: "Nothing to pause for this stop" }, { status: 400 });
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({ paused_at: now, updated_at: now })
    .in("id", openIds)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ visitIds: openIds, visits: data });
}
