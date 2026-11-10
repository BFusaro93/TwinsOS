import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";
import { createOrgCanceledResolver } from "@/lib/orgs/org-canceled";
import {
  GENERATOR_JOB_COLUMNS,
  NON_GENERATING_JOB_STATUSES,
  generateVisitsForJobs,
  selectAllRows,
  type GeneratorJob,
} from "@/lib/visits/generate";

const log = logger.child("cron/recurring-visits");

// Loops every org; give it room before the default function limit.
export const maxDuration = 300;

/**
 * GET /api/cron/recurring-visits — called daily by Vercel Cron at 06:00 UTC.
 *
 * Tops up every active recurring / package job's visits LOOKAHEAD_DAYS ahead
 * of ITS org's today, using the same generator as /api/crm/jobs/generate-visits
 * (src/lib/visits/generate.ts): crm_schedules-driven recurrence (anchor,
 * interval weeks, weekday, season window), one visit per job service, and
 * occurrence identity so moved/deleted visits are never re-created.
 * Idempotent — safe to re-run.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */

const LOOKAHEAD_DAYS = 14;
/** cron_cursors row holding the org id the next run starts with. */
const CURSOR_NAME = "recurring-visits";
/** Stop starting new orgs after this long, leaving room before maxDuration. */
const RUN_BUDGET_MS = 270_000;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const isCron =
    process.env.CRON_SECRET &&
    authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Paginated — every org's active jobs can exceed PostgREST's 1000-row cap.
  const { rows: allJobs, error: jobsErr } = await selectAllRows<GeneratorJob>(() =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("crm_jobs")
      .select(GENERATOR_JOB_COLUMNS)
      .in("job_type", ["recurring", "package"])
      .not("status", "in", `(${NON_GENERATING_JOB_STATUSES.map((s) => `"${s}"`).join(",")})`)
      .is("deleted_at", null)
  );

  if (jobsErr) {
    log.error("job fetch failed", { error: jobsErr });
    return NextResponse.json({ error: jobsErr }, { status: 500 });
  }

  // Canceled orgs get no automated visit generation (resolved per job's org;
  // the resolver caches per org for this run).
  const orgCanceled = createOrgCanceledResolver(supabase);
  const jobs: GeneratorJob[] = [];
  for (const job of allJobs) {
    if (await orgCanceled(job.org_id)) continue;
    jobs.push(job);
  }
  if (jobs.length === 0) {
    return NextResponse.json({ generated: 0, message: "No recurring jobs found." });
  }

  const orgToday = new Map<string, string>();
  const todayFor = async (orgId: string | null | undefined) => {
    const k = orgId ?? "";
    let hit = orgToday.get(k);
    if (!hit) {
      hit = todayInZone(await getOrgTimeZone(supabase, orgId));
      orgToday.set(k, hit);
    }
    return hit;
  };

  // One org at a time: the generator stops at the first failed query, so a single org's bad
  // data must not stop every other org's visits from being generated.
  const jobsByOrg = new Map<string, GeneratorJob[]>();
  for (const job of jobs) {
    const k = job.org_id ?? "";
    const list = jobsByOrg.get(k);
    if (list) list.push(job);
    else jobsByOrg.set(k, [job]);
  }
  const result = { planned: 0, inserted: 0, errors: [] as unknown[] };
  // Stop starting orgs before maxDuration (one org with thousands of package programs can use
  // most of a run) and resume NEXT run exactly where this one stopped: the cursor holds the
  // org to start with. (Shifting the start by one org per day instead left the orgs behind a
  // slow stretch waiting weeks.) It is written BEFORE each org is processed, pointing past it,
  // so a run killed mid-org still moves on — that org's inserts are idempotent, and it gets its
  // turn again when the rotation comes back round. Visits are generated LOOKAHEAD_DAYS ahead,
  // so an org that waits a day is caught up then.
  const startedAt = Date.now();
  let stoppedEarly = false;
  const orgIds = [...jobsByOrg.keys()].sort();
  const cursor = await readCursor(supabase);
  const start = cursor ? Math.max(0, orgIds.findIndex((id) => id >= cursor)) : 0;
  const order = [...orgIds.slice(start), ...orgIds.slice(0, start)];
  let processed = 0;
  for (let i = 0; i < order.length; i++) {
    const orgId = order[i];
    if (Date.now() - startedAt > RUN_BUDGET_MS) { stoppedEarly = true; break; }
    await writeCursor(supabase, order[(i + 1) % order.length]);
    processed++;
    const orgJobs = jobsByOrg.get(orgId) ?? [];
    try {
      const r = await generateVisitsForJobs(supabase, orgJobs, {
        horizonDays: LOOKAHEAD_DAYS,
        packageWindowOnly: true,
        todayFor,
      });
      result.planned += r.planned;
      result.inserted += r.inserted;
      result.errors.push(...r.errors);
    } catch (err) {
      log.error("visit generation threw for org", { err, orgId });
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (result.errors.length > 0) {
    log.error("visit generation errors", { errors: result.errors.slice(0, 10), count: result.errors.length });
  }
  if (stoppedEarly) {
    log.warn("recurring visits stopped at the time budget; the next run resumes with the first org not reached", {
      orgs: orgIds.length,
      processed,
    });
  }
  log.info("recurring visits generated", {
    jobs: jobs.length,
    orgCalendars: orgToday.size,
    planned: result.planned,
    inserted: result.inserted,
  });

  return NextResponse.json({
    generated: result.inserted,
    planned: result.planned,
    errors: result.errors.length,
    stoppedEarly,
  }, { status: result.errors.length > 0 && result.inserted === 0 ? 500 : 200 });
}

type CronClient = SupabaseClient<Database>;

/** The org id to start with, or null (start at the beginning). A read failure starts at the beginning. */
async function readCursor(supabase: CronClient): Promise<string | null> {
  const { data, error } = await supabase.from("cron_cursors").select("cursor").eq("name", CURSOR_NAME).maybeSingle();
  if (error) {
    log.warn("cron cursor read failed; starting at the first org", { error: error.message });
    return null;
  }
  return data?.cursor ?? null;
}

async function writeCursor(supabase: CronClient, orgId: string | undefined): Promise<void> {
  const { error } = await supabase
    .from("cron_cursors")
    .upsert({ name: CURSOR_NAME, cursor: orgId ?? null, updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) log.warn("cron cursor write failed", { error: error.message });
}
