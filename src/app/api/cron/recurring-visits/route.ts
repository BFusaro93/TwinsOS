import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";
import {
  GENERATOR_JOB_COLUMNS,
  NON_GENERATING_JOB_STATUSES,
  generateVisitsForJobs,
  selectAllRows,
  type GeneratorJob,
} from "@/lib/visits/generate";

const log = logger.child("cron/recurring-visits");

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
  const { rows: jobs, error: jobsErr } = await selectAllRows<GeneratorJob>(() =>
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
  if (jobs.length === 0) {
    return NextResponse.json({ generated: 0, message: "No recurring jobs found." });
  }

  const orgToday = new Map<string, string>();
  const result = await generateVisitsForJobs(supabase, jobs, {
    horizonDays: LOOKAHEAD_DAYS,
    packageWindowOnly: true,
    todayFor: async (orgId) => {
      const k = orgId ?? "";
      let hit = orgToday.get(k);
      if (!hit) {
        hit = todayInZone(await getOrgTimeZone(supabase, orgId));
        orgToday.set(k, hit);
      }
      return hit;
    },
  });

  if (result.errors.length > 0) {
    log.error("visit generation errors", { errors: result.errors.slice(0, 10), count: result.errors.length });
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
  }, { status: result.errors.length > 0 && result.inserted === 0 ? 500 : 200 });
}
