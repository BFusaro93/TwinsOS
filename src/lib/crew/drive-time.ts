// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Closes the crew's open drive segment (if any), stamping ended_at and the
 * elapsed minutes. Shared by the explicit "Arrived" action and the
 * auto-close safety net on stop clock-in (a crew that forgets to hit
 * "Arrived" before starting the next job shouldn't leave a segment open
 * forever) — see stops/[visitId]/clock-in/route.ts.
 */
export async function closeOpenDriveSegment(
  supabase: AnySupabase,
  crewId: string,
  now: Date = new Date()
): Promise<{ closed: boolean; error?: string }> {
  const { data: open } = await supabase
    .from("crm_crew_drive_segments")
    .select("id, started_at")
    .eq("crew_id", crewId)
    .is("ended_at", null)
    .maybeSingle();
  if (!open) return { closed: false };

  const minutes = Math.max(0, Math.round(
    (now.getTime() - new Date(open.started_at as string).getTime()) / 60_000
  ));
  const { error } = await supabase
    .from("crm_crew_drive_segments")
    .update({ ended_at: now.toISOString(), minutes })
    .eq("id", open.id);
  if (error) return { closed: false, error: error.message };
  return { closed: true };
}
