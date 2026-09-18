import { NextResponse } from "next/server";
import { z } from "zod";
import { stopKeyForVisit, isNotesAcknowledgmentCurrent, type StopKeyInput } from "@/lib/utils/visit-stops";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { closeOpenDriveSegment } from "@/lib/crew/drive-time";
import { logger } from "@/lib/logger";

const log = logger.child("crew/stops/clock-in");

const Body = z.object({
  // HH:mm in the crew member's local time — the server (Vercel) runs in UTC,
  // so the actual local time-of-day must come from the client's browser clock.
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

interface VisitRow {
  id: string;
  org_id: string;
  client_id: string;
  scheduled_date: string;
  crew_id: string | null;
  status: string;
  clocked_in_at: string | null;
  notes_to_crew: string | null;
  notes_to_crew_updated_at: string | null;
  acknowledged_notes_at: string | null;
  crm_jobs: {
    property_id: string | null;
    service_address: string | null;
    service_city: string | null;
    notes_to_crew: string | null;
    notes_to_crew_updated_at: string | null;
  } | null;
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

const VISIT_SELECT = `
  id, org_id, client_id, scheduled_date, crew_id, status, clocked_in_at,
  notes_to_crew, notes_to_crew_updated_at, acknowledged_notes_at,
  crm_jobs(property_id, service_address, service_city, notes_to_crew, notes_to_crew_updated_at)
`;

/** The notes-to-crew this visit contributes to its stop, visit-level overriding job-level (same rule as groupVisitsIntoStops). */
function notesForRow(row: VisitRow): { text: string | null; updatedAt: string | null } {
  const text = row.notes_to_crew || row.crm_jobs?.notes_to_crew || null;
  const updatedAt = [row.notes_to_crew_updated_at, row.crm_jobs?.notes_to_crew_updated_at]
    .filter((s): s is string => !!s)
    .sort()
    .pop() ?? null;
  return { text, updatedAt };
}

/**
 * Clocks in every visit that makes up "this stop" (same client/day/crew/
 * address as the anchor visit in the URL) with one action — the crew tablet
 * groups these into a single card, but the underlying data model still has
 * one crm_job_visits row per service so office-side reporting stays
 * per-service accurate. Derives the sibling set itself from the anchor
 * rather than trusting a client-supplied list.
 *
 * Accepts either the web app's cookie session or crew-app's bearer token —
 * see getRouteAuth().
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId: anchorVisitId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: anchorRow, error: anchorErr } = await (supabase as any)
    .from("crm_job_visits")
    .select(VISIT_SELECT)
    .eq("id", anchorVisitId)
    .is("deleted_at", null)
    .single();
  if (anchorErr || !anchorRow) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  const anchor = anchorRow as VisitRow;

  // Guard against clocking in another crew's visit — RLS on crm_job_visits
  // only checks org_id, not crew_id, so a caller who obtains another crew's
  // visitId could otherwise still act on it. See assertCallerOwnsVisit().
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
  const stopRows = (candidateRows as VisitRow[])
    .filter((r) => stopKeyForVisit(toStopKeyInput(r)) === anchorKey)
    // Defense in depth: stopKeyForVisit already encodes crew_id, so a match
    // on anchorKey mathematically implies r.crew_id === anchor.crew_id (the
    // crew whose ownership was just verified above) — this filter makes that
    // invariant explicit rather than implicit, so no row outside the caller's
    // crew can ever enter the mutation set below.
    .filter((r) => r.crew_id === anchor.crew_id);

  // Notes-acknowledgment gate, enforced here and not only in the two clients.
  // It was previously a pure UI disable on the Clock In button, so anything
  // replaying the request (the offline queue, a stale tab, curl) walked
  // straight past a "DOG IS LOOSE" note. The acknowledgment lives on the
  // anchor — that's the row both clients stamp — and it goes stale the moment
  // the office edits the notes afterwards, which is what
  // isNotesAcknowledgmentCurrent() compares.
  const stopNotes = stopRows.map(notesForRow).filter((n) => !!n.text);
  if (stopNotes.length > 0) {
    const notesUpdatedAt = stopNotes
      .map((n) => n.updatedAt)
      .filter((s): s is string => !!s)
      .sort()
      .pop() ?? null;
    if (!isNotesAcknowledgmentCurrent(anchor.acknowledged_notes_at, notesUpdatedAt)) {
      return NextResponse.json(
        {
          error: anchor.acknowledged_notes_at
            ? "The office updated this job's notes — read them again before starting."
            : "Read and acknowledge this job's notes before starting.",
          requiresNotesAcknowledgment: true,
        },
        { status: 409 }
      );
    }
  }

  const siblingIds = stopRows
    .filter((r) => !r.clocked_in_at) // already clocked in — idempotent/double-tap safe
    .map((r) => r.id);

  if (siblingIds.length === 0) {
    return NextResponse.json({ error: "Nothing to clock in for this stop" }, { status: 400 });
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_in_at: now,
      start_time: parsed.data.localTime ? `${parsed.data.localTime}:00` : undefined,
      status: "in_progress",
      updated_at: now,
    })
    .in("id", siblingIds)
    .select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Safety net: a crew that forgets to hit "Arrived" before starting the
  // next job shouldn't leave a drive segment open for the rest of the day —
  // starting a job means they've clearly stopped driving. Non-fatal.
  try {
    await closeOpenDriveSegment(supabase, anchor.crew_id!);
  } catch (err) {
    log.error("auto-close drive segment failed", {
      crewId: anchor.crew_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ visitIds: siblingIds, visits: data });
}
