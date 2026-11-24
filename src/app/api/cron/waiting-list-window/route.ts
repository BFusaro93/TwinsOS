import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchOrgTriggers, fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { resolveDateGapDays } from "@/lib/automations/activation-warnings";
import { createOrgOutboundMutedResolver } from "@/lib/orgs/org-canceled";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { shiftYmd, todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";

const log = logger.child("cron/waiting-list-window");

/**
 * GET /api/cron/waiting-list-window — called daily by Vercel Cron (14:05 UTC, with the
 * other date-based automation crons).
 *
 * Fires two job-scoped triggers for waiting-list jobs that are STILL waiting (no live
 * visit yet, not cancelled):
 *  - 'waiting_list_ending': the job's window ends N days from the org's today, where N is
 *    each trigger's "days before the window ends" (3 when left blank).
 *  - 'waiting_list_window_passed': the window ended in the last 7 days. The lookback keeps
 *    a missed cron day from skipping a job without making a newly activated automation
 *    fire for every old job.
 * Runs are once per job per trigger (a stop-rule ends a run once the job is scheduled or
 * cancelled). Running it again the same day is safe.
 */
export const maxDuration = 300;

const PASSED_LOOKBACK_DAYS = 7;
const BUDGET_MS = 270_000;

type JobRow = { id: string; client_id: string; waiting_list_end: string };

/** Waiting-list jobs in the date window that have no live (non-cancelled) visit yet. */
async function stillWaitingJobs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  orgId: string,
  range: { from: string; to: string }
): Promise<JobRow[]> {
  const jobs: JobRow[] = [];
  for (let from = 0; ; ) {
    const { data: page, error } = await supabase
      .from("crm_jobs")
      .select("id, client_id, waiting_list_end")
      .eq("org_id", orgId)
      .eq("job_type", "waiting_list")
      .neq("status", "cancelled")
      .gte("waiting_list_end", range.from)
      .lte("waiting_list_end", range.to)
      .is("deleted_at", null)
      .order("id")
      .range(from, from + 999);
    if (error) {
      log.error("job lookup failed", { orgId, error: error.message });
      break;
    }
    if (!page || page.length === 0) break;
    jobs.push(...(page as JobRow[]));
    if (page.length < 1000) break;
    from += page.length;
  }
  if (jobs.length === 0) return jobs;

  // Jobs that already have a live visit are scheduled, not waiting. Chunked: an .in()
  // list of ids rides in the URL.
  const scheduled = new Set<string>();
  for (let i = 0; i < jobs.length; i += 200) {
    const ids = jobs.slice(i, i + 200).map((j) => j.id);
    const { data: visits } = await supabase
      .from("crm_job_visits")
      .select("job_id")
      .eq("org_id", orgId)
      .in("job_id", ids)
      .neq("status", "cancelled")
      .is("deleted_at", null);
    for (const v of (visits ?? []) as { job_id: string }[]) scheduled.add(v.job_id);
  }
  return jobs.filter((j) => !scheduled.has(j.id));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  type TriggerRow = { org_id: string; trigger_type: string; config: unknown };
  const triggers: TriggerRow[] = [];
  for (let from = 0; ; ) {
    const { data: page, error } = await supabase
      .from("crm_sequence_triggers")
      .select("org_id, trigger_type, config")
      .in("trigger_type", ["waiting_list_ending", "waiting_list_window_passed"])
      .order("id")
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!page || page.length === 0) break;
    triggers.push(...(page as TriggerRow[]));
    if (page.length < 1000) break;
    from += page.length;
  }

  const byOrg = new Map<string, { endingDays: Set<number>; passed: boolean }>();
  for (const t of triggers) {
    const entry = byOrg.get(t.org_id) ?? { endingDays: new Set<number>(), passed: false };
    if (t.trigger_type === "waiting_list_window_passed") entry.passed = true;
    else {
      const days = resolveDateGapDays(t.config, "waiting_list_ending");
      if (days !== null) entry.endingDays.add(days);
    }
    byOrg.set(t.org_id, entry);
  }

  const startedAt = Date.now();
  const orgMuted = createOrgOutboundMutedResolver(supabase, { requireModule: "landscapt" });
  let fired = 0;
  let stoppedEarly = false;

  outer: for (const [orgId, { endingDays, passed }] of byOrg) {
    if (await orgMuted(orgId)) continue; // canceled / Equipt-only orgs send nothing
    const orgToday = todayInZone(await getOrgTimeZone(supabase, orgId));

    if (endingDays.size > 0) {
      const orgTriggers = await fetchOrgTriggers(supabase, orgId, "waiting_list_ending");
      for (const days of endingDays) {
        if (Date.now() - startedAt > BUDGET_MS) { stoppedEarly = true; break outer; }
        const target = shiftYmd(orgToday, days);
        const jobs = await stillWaitingJobs(supabase, orgId, { from: target, to: target });
        // Only the triggers configured for exactly this many days fire for these jobs.
        const matching = orgTriggers.filter((t: { config?: unknown }) => resolveDateGapDays(t.config, "waiting_list_ending") === days);
        for (const job of jobs) {
          if (Date.now() - startedAt > BUDGET_MS) { stoppedEarly = true; break outer; }
          await fireSimpleTrigger(supabase, {
            orgId,
            clientId: job.client_id,
            jobId: job.id,
            recordId: job.id,
            anchorKey: job.waiting_list_end,
            triggerType: "waiting_list_ending",
          }, matching);
          fired++;
        }
      }
    }

    if (passed) {
      if (Date.now() - startedAt > BUDGET_MS) { stoppedEarly = true; break; }
      const orgTriggers = await fetchOrgTriggers(supabase, orgId, "waiting_list_window_passed");
      const jobs = await stillWaitingJobs(supabase, orgId, {
        from: shiftYmd(orgToday, -PASSED_LOOKBACK_DAYS),
        to: shiftYmd(orgToday, -1),
      });
      for (const job of jobs) {
        if (Date.now() - startedAt > BUDGET_MS) { stoppedEarly = true; break outer; }
        await fireSimpleTrigger(supabase, {
          orgId,
          clientId: job.client_id,
          jobId: job.id,
          recordId: job.id,
          anchorKey: job.waiting_list_end,
          triggerType: "waiting_list_window_passed",
        }, orgTriggers);
        fired++;
      }
    }
  }

  return NextResponse.json({ orgs: byOrg.size, fired, stoppedEarly });
}
