// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * A member pulled onto another crew mid-day (crew app "add member", dispatch
 * board Team Assignment): closes their OPEN job punches on every visit that is
 * NOT the new crew's, at the move instant, so the old crew's job stops
 * accruing their time and the hours are counted once (the new crew's own punch
 * for them starts separately). The member's DAY shift (crm_crew_day_shifts) is
 * deliberately left running — they are still on the clock, just on a different
 * crew. A punch that started at/after the move instant is closed zero-length
 * rather than negative. Returns how many punches were closed. Throws on a read
 * or write failure so the caller can refuse to move the member rather than
 * leave the old crew's punch dangling.
 *
 * A visit's crew is its own crew_id, else the job's (crew_id is usually NULL);
 * a visit pinned to "no crew" belongs to nobody, so it is also closed.
 */
export async function closeMemberPunchesOnOtherCrews(
  supabase: AnySupabase,
  args: { memberId: string; newCrewId: string; at: string }
): Promise<number> {
  const { memberId, newCrewId, at } = args;
  const { data: open, error } = await supabase
    .from("crm_crew_member_times")
    .select("id, clocked_in_at, crm_job_visits(crew_id, crew_unassigned, crm_jobs(crew_id))")
    .eq("crew_member_id", memberId)
    .is("deleted_at", null)
    .is("clocked_out_at", null)
    .not("clocked_in_at", "is", null);
  if (error) throw new Error(error.message);

  type OpenPunch = {
    id: string;
    clocked_in_at: string;
    crm_job_visits: { crew_id: string | null; crew_unassigned: boolean | null; crm_jobs: { crew_id: string | null } | null } | null;
  };
  const atMs = new Date(at).getTime();
  let closed = 0;
  for (const p of (open ?? []) as OpenPunch[]) {
    const v = p.crm_job_visits;
    if (!v) continue;
    const effective = v.crew_unassigned ? null : (v.crew_id ?? v.crm_jobs?.crew_id ?? null);
    if (effective === newCrewId) continue;
    const out = new Date(p.clocked_in_at).getTime() >= atMs ? p.clocked_in_at : at;
    const { data: upd, error: updErr } = await supabase
      .from("crm_crew_member_times")
      .update({ clocked_out_at: out, updated_at: at })
      .eq("id", p.id)
      .is("clocked_out_at", null)
      .select("id");
    if (updErr) throw new Error(updErr.message);
    closed += ((upd ?? []) as unknown[]).length;
  }
  return closed;
}
