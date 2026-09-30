import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { isoInZone } from "@/lib/time/zone";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * How long a drive segment left open past its own work day is credited for
 * when it's finally closed. A crew that forgets to tap "Arrived" at the end of
 * the day used to have the segment closed by the NEXT morning's first action —
 * ~14 hours of paid "driving". There's no review column on
 * crm_crew_drive_segments, so the stale segment is closed at its start plus
 * this cap instead: a realistic last-leg drive, not the overnight gap. The
 * office can still correct the minutes afterwards.
 */
export const STALE_DRIVE_SEGMENT_CAP_MINUTES = 60;

interface OpenSegment {
  id: string;
  started_at: string;
  work_date: string;
}

/**
 * Closes the crew's open drive segment (if any), stamping ended_at and the
 * elapsed minutes. Shared by the explicit "Arrived" action, the auto-close
 * safety net on stop clock-in (a crew that forgets to hit "Arrived" before
 * starting the next job shouldn't leave a segment open forever — see
 * stops/[visitId]/clock-in/route.ts), and "start drive" (via
 * closeStaleDriveSegment, so it never hands back yesterday's segment).
 *
 * A segment whose work_date is before the org's today is STALE: it's closed at
 * started_at + STALE_DRIVE_SEGMENT_CAP_MINUTES (never later than now) rather
 * than at now. "Today" is the ORG's day (organizations.timezone), matching how
 * work_date was stamped at start.
 */
export async function closeOpenDriveSegment(
  supabase: AnySupabase,
  crewId: string,
  orgId: string,
  now: Date = new Date()
): Promise<{ closed: boolean; stale?: boolean; error?: string }> {
  const { data: open } = await supabase
    .from("crm_crew_drive_segments")
    .select("id, started_at, work_date")
    .eq("crew_id", crewId)
    .is("ended_at", null)
    .maybeSingle();
  if (!open) return { closed: false };
  const segment = open as OpenSegment;

  const today = isoInZone(now, await getOrgTimeZone(supabase, orgId));
  const stale = segment.work_date < today;
  const startedMs = new Date(segment.started_at).getTime();
  const endMs = Math.max(
    startedMs,
    stale
      ? Math.min(now.getTime(), startedMs + STALE_DRIVE_SEGMENT_CAP_MINUTES * 60_000)
      : now.getTime()
  );

  const minutes = Math.round((endMs - startedMs) / 60_000);
  const { error } = await supabase
    .from("crm_crew_drive_segments")
    .update({ ended_at: new Date(endMs).toISOString(), minutes })
    .eq("id", segment.id)
    // Re-checked at write time so a concurrent close can't be overwritten.
    .is("ended_at", null);
  if (error) return { closed: false, error: error.message };
  return { closed: true, stale };
}

/**
 * Closes the crew's open segment only if it's STALE (from an earlier org day),
 * leaving today's open segment alone. Returns today's open segment, if any —
 * what "start drive" hands back idempotently.
 */
export async function closeStaleDriveSegment(
  supabase: AnySupabase,
  crewId: string,
  orgId: string,
  now: Date = new Date()
): Promise<{ openToday: Record<string, unknown> | null; error?: string }> {
  const { data: open } = await supabase
    .from("crm_crew_drive_segments")
    .select("*")
    .eq("crew_id", crewId)
    .is("ended_at", null)
    .maybeSingle();
  if (!open) return { openToday: null };

  const today = isoInZone(now, await getOrgTimeZone(supabase, orgId));
  if ((open as OpenSegment).work_date >= today) return { openToday: open as Record<string, unknown> };

  const result = await closeOpenDriveSegment(supabase, crewId, orgId, now);
  if (result.error) return { openToday: null, error: result.error };
  return { openToday: null };
}
