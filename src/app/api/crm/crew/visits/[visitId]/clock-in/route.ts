import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { isNotesAcknowledgmentCurrent } from "@/lib/utils/visit-stops";

/** Visits a crew can no longer start. Same set the stop clock-in excludes. */
const TERMINAL_STATUSES = ["completed", "cancelled", "skipped"];
const TERMINAL_STATUS_FILTER = `(${TERMINAL_STATUSES.join(",")})`;

const Body = z.object({
  // HH:mm in the crew member's local time — the server (Vercel) runs in UTC,
  // so the actual local time-of-day must come from the client's browser clock.
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  // Accepts either the web app's cookie session or crew-app's bearer token —
  // see getRouteAuth().
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const now = new Date().toISOString();

  // Idempotent/double-tap safe, matching the stops batch clock-in — a
  // second tap must not reset an already-recorded start time and silently
  // shorten the visit's duration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("crm_job_visits")
    .select(`
      clocked_in_at, org_id, crew_id, status,
      notes_to_crew, notes_to_crew_updated_at, acknowledged_notes_at,
      crm_jobs(crew_id, notes_to_crew, notes_to_crew_updated_at)
    `)
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, existing.org_id, existing))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  if (existing?.clocked_in_at) {
    return NextResponse.json({ error: "Already clocked in" }, { status: 409 });
  }
  // A completed / cancelled / skipped visit is never flipped back to
  // in_progress: that would re-run completion side effects on clock-out, and
  // for an invoiced visit the DB guard (trg_crm_job_visits_guard_invoiced)
  // rejects it outright — which surfaced as a raw 500.
  if (TERMINAL_STATUSES.includes(existing.status)) {
    return NextResponse.json(
      { error: `This visit is already ${existing.status} — ask the office to reopen it before clocking in.`, code: "visit_terminal" },
      { status: 409 }
    );
  }

  // Notes-acknowledgment gate — the same server-side enforcement the stop
  // clock-in route applies, so neither entry point can be walked past by a
  // replayed request. See isNotesAcknowledgmentCurrent(): an acknowledgment
  // given before the office last edited the notes no longer counts.
  const notesText = existing.notes_to_crew || existing.crm_jobs?.notes_to_crew || null;
  if (notesText) {
    const notesUpdatedAt = [existing.notes_to_crew_updated_at, existing.crm_jobs?.notes_to_crew_updated_at]
      .filter((s: string | null): s is string => !!s)
      .sort()
      .pop() ?? null;
    if (!isNotesAcknowledgmentCurrent(existing.acknowledged_notes_at, notesUpdatedAt)) {
      return NextResponse.json(
        {
          error: existing.acknowledged_notes_at
            ? "The office updated this job's notes — read them again before starting."
            : "Read and acknowledge this job's notes before starting.",
          requiresNotesAcknowledgment: true,
        },
        { status: 409 }
      );
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_job_visits")
    .update({
      clocked_in_at: now,
      start_time: parsed.data.localTime ? `${parsed.data.localTime}:00` : undefined,
      status: "in_progress",
      updated_at: now,
    })
    .eq("id", visitId)
    .is("clocked_in_at", null)
    // Re-checked in the write: the office may complete it between the read above and here.
    .not("status", "in", TERMINAL_STATUS_FILTER)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "This visit was just clocked in or closed out — refresh and try again.", code: "visit_changed" },
      { status: 409 }
    );
  }
  return NextResponse.json(data);
}
