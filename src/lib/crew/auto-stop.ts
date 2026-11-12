import { selectEffectiveCrewVisits, CARRY_OVER_MAX_DAYS } from "@/lib/supabase/crew-id";
import { closeStopPunches, resolvePunchOwnerVisitId } from "@/lib/crew/stop-punches";
import { recomputeStopLabor } from "@/lib/crew/visit-labor";
import { createServiceClient } from "@/lib/supabase/server";
import { createVisitWriter } from "@/lib/crew/visit-writer";
import { formatInZone, instantToZoneWallClock, isoInZone, shiftYmd } from "@/lib/time/zone";
import { logger } from "@/lib/logger";

const log = logger.child("crew/auto-stop");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

interface RunningVisit {
  id: string;
  client_id: string | null;
  scheduled_date: string;
  clocked_in_at: string;
  paused_at: string | null;
}

/**
 * A crew can only be on one job at a time. When Start Job runs while another of
 * THIS crew's stops is still clocked in (the crew drove off without tapping
 * Stop Job), every member ended up punched in on both, so the hours between the
 * two were paid and costed twice.
 *
 * Owner's rule: the other stop is stopped automatically at the new stop's
 * clock-in — or at its pause, if it was paused (no work happened after that):
 *   - its visits get clocked_out_at / end_time at that instant, the running
 *     pause cleared; they stay IN PROGRESS, so the crew's next Stop Job on it
 *     (or the office's Mark Complete) finishes it through the normal photo /
 *     chemical gates and completion side effects at that same instant (see the
 *     clock-out route's auto-stopped branch);
 *   - its members' open punches are closed at the same instant and its hours
 *     and labor recomputed from them (recomputeStopLabor);
 *   - a job comment on each of its visits tells the office it was "Stopped
 *     automatically when the crew started <new stop>".
 *
 * Only stops whose EFFECTIVE crew is the caller's crew are touched — a
 * multi-crew stop's other crews keep running. Stops clocked in more than
 * CARRY_OVER_MAX_DAYS ago are forgotten clock-ins the crew can't see any more;
 * they're left for payroll to flag rather than closed at an absurd length.
 *
 * Non-throwing: a failure here must never block the new Start Job. Returns
 * the visit ids it stopped.
 */
export async function autoStopOtherRunningStops(
  supabase: AnySupabase,
  p: {
    orgId: string;
    crewId: string;
    /** Visits of the stop being started — never stopped here. */
    exceptVisitIds: string[];
    /** The new stop's clock-in instant (ISO). */
    at: string;
    /** How the office will recognise the new stop ("Smith — 12 Oak St"). */
    newStopLabel: string;
    timeZone: string;
    userId: string;
  }
): Promise<string[]> {
  const stopped: string[] = [];
  try {
    const atMs = Date.parse(p.at);
    const except = new Set(p.exceptVisitIds);
    const today = isoInZone(new Date(p.at), p.timeZone);
    const { data, error } = await selectEffectiveCrewVisits(
      supabase,
      "id, client_id, scheduled_date, clocked_in_at, paused_at, crm_jobs:crew_job(crew_id)",
      p.crewId,
      (q) =>
        q.eq("org_id", p.orgId)
          .is("deleted_at", null)
          .gte("scheduled_date", shiftYmd(today, -CARRY_OVER_MAX_DAYS))
          .not("clocked_in_at", "is", null)
          .is("clocked_out_at", null)
          .not("status", "in", "(completed,cancelled,skipped)")
    );
    if (error) {
      log.warn("could not read running stops", { crewId: p.crewId, error: error.message });
      return stopped;
    }
    const running = (data as unknown as RunningVisit[])
      .filter((v) => !except.has(v.id) && Date.parse(v.clocked_in_at) < atMs);
    if (running.length === 0) return stopped;

    // A stop clocks in together: same client, day and clock-in instant.
    const groups = new Map<string, RunningVisit[]>();
    for (const v of running) {
      const key = `${v.client_id ?? ""}|${v.scheduled_date}|${v.clocked_in_at}`;
      groups.set(key, [...(groups.get(key) ?? []), v]);
    }

    const punchWriter = createServiceClient();
    // A crew login can't write clocked_out_at / end_time / paused_at directly
    // (a_crm_job_visits_crew_price_guard); the stops were found under the
    // caller's own crew above.
    const visitWriter = createVisitWriter(p.userId);
    for (const visits of groups.values()) {
      const ids = visits.map((v) => v.id);
      const pausedAt = visits.map((v) => v.paused_at).filter((v): v is string => !!v).sort()[0] ?? null;
      const endAt = pausedAt && Date.parse(pausedAt) < atMs ? pausedAt : p.at;
      const endWall = instantToZoneWallClock(new Date(endAt), p.timeZone).time;

      const landed: string[] = [];
      for (const id of ids) {
        const { data: updated, error: updErr } = await visitWriter
          .from("crm_job_visits")
          .update({ clocked_out_at: endAt, end_time: `${endWall}:00`, paused_at: null, updated_at: p.at })
          .eq("id", id)
          .is("clocked_out_at", null)
          .not("status", "in", "(completed,cancelled,skipped)")
          .select("id");
        if (updErr) log.warn("auto-stop visit update failed", { visitId: id, error: updErr.message });
        else if (((updated ?? []) as unknown[]).length > 0) landed.push(id);
      }
      if (landed.length === 0) continue;
      stopped.push(...landed);

      const punchVisitId = await resolvePunchOwnerVisitId(supabase, ids, ids[0]);
      await closeStopPunches(punchWriter, punchVisitId, endAt);
      await recomputeStopLabor(supabase, punchVisitId, visitWriter);

      const text = `Stopped automatically at ${formatInZone(endAt, p.timeZone, { hour: "numeric", minute: "2-digit" })} when the crew started ${p.newStopLabel} — Stop Job was never tapped here. Finish it with Stop Job in the crew app or Mark Complete.`;
      for (const id of landed) {
        const { error: commentErr } = await supabase.rpc("crm_append_visit_job_comment", {
          p_visit_id: id,
          // Deterministic per visit + stop instant, so a retried Start Job can't post it twice.
          p_comment_id: `auto-stop-${id}-${Date.parse(endAt)}`,
          p_author_name: "Crew app",
          p_author_id: p.userId,
          p_text: text,
          p_created_at: p.at,
        });
        if (commentErr) log.warn("auto-stop comment failed", { visitId: id, error: commentErr.message });
      }
    }
  } catch (err) {
    log.error("auto-stop of other running stops failed", { crewId: p.crewId, error: err instanceof Error ? err.message : String(err) });
  }
  return stopped;
}
