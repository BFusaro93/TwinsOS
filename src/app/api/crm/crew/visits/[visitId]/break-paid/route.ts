import { NextResponse } from "next/server";
import { z } from "zod";
import { stopKeyForVisit, type StopKeyInput } from "@/lib/utils/visit-stops";
import { getRouteAuth, effectiveVisitCrewId } from "@/lib/supabase/route-auth";
import { recomputeStopLabor } from "@/lib/crew/visit-labor";

/**
 * Office override for whether a stop's crew pause time is paid
 * (crm_job_visits.break_paid: true = paid, false = unpaid, null = follow the
 * org setting). OFFICE ONLY — crew logins are rejected; the crew app has no
 * control for this.
 *
 * `visitId` should be the stop's anchor visit (the one crew punches hang
 * off). The value is written to every live visit in the stop (same
 * client/day/crew/property — the same sibling set Pause/Resume write
 * break_minutes across), then the stop's stored labor cost is recomputed.
 */
const Body = z.object({ breakPaid: z.boolean().nullable() });

interface VisitRow {
  id: string;
  org_id: string;
  client_id: string;
  scheduled_date: string;
  crew_id: string | null;
  crm_jobs: { crew_id?: string | null; property_id: string | null; service_address: string | null; service_city: string | null } | null;
}

const VISIT_SELECT = "id, org_id, client_id, scheduled_date, crew_id, crew_unassigned, crm_jobs(crew_id, property_id, service_address, service_city)";

function toStopKeyInput(row: VisitRow): StopKeyInput {
  return {
    clientId: row.client_id,
    scheduledDate: row.scheduled_date,
    crewId: effectiveVisitCrewId(row),
    job: row.crm_jobs
      ? { propertyId: row.crm_jobs.property_id, serviceAddress: row.crm_jobs.service_address, serviceCity: row.crm_jobs.service_city }
      : undefined,
  };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data: profile } = await db.from("profiles").select("org_id, role").eq("id", user.id).maybeSingle();
  if (!profile?.org_id) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });
  if (profile.role === "crew") {
    return NextResponse.json({ error: "Only the office can change whether breaks are paid" }, { status: 403 });
  }

  const { visitId } = await params;
  // Org scoping is RLS's job (my_org_id() honours staff impersonation).
  const { data: anchorRow, error: anchorErr } = await db
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (anchorErr) return NextResponse.json({ error: anchorErr.message }, { status: 500 });
  if (!anchorRow) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const anchor = anchorRow as VisitRow;

  const { data: candidates, error: candErr } = await db
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("client_id", anchor.client_id)
    .eq("scheduled_date", anchor.scheduled_date)
    .is("deleted_at", null)
    .not("status", "in", "(cancelled,skipped)");
  if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });

  const anchorKey = stopKeyForVisit(toStopKeyInput(anchor));
  const ids = new Set<string>([anchor.id]);
  for (const r of (candidates ?? []) as VisitRow[]) {
    if (effectiveVisitCrewId(r) === effectiveVisitCrewId(anchor) && stopKeyForVisit(toStopKeyInput(r)) === anchorKey) {
      ids.add(r.id);
    }
  }

  const { error } = await db
    .from("crm_job_visits")
    .update({ break_paid: parsed.data.breakPaid, updated_at: new Date().toISOString() })
    .in("id", [...ids]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // recomputeStopLabor locates the closed siblings itself and no-ops when
  // nothing in the stop has been clocked out yet.
  await recomputeStopLabor(supabase, anchor.id);
  return NextResponse.json({ visitIds: [...ids], breakPaid: parsed.data.breakPaid });
}
