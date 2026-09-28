import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import {
  GENERATOR_JOB_COLUMNS,
  NON_GENERATING_JOB_STATUSES,
  generateVisitsForJobs,
  type GeneratorJob,
} from "@/lib/visits/generate";
import {
  SCHEDULE_CHANGE_PRUNE_STATUSES,
  findUntouchedFutureVisits,
  pruneVisits,
} from "@/lib/visits/prune";

/** Default rolling horizon — a year ahead, bounded by the job's own
 *  recurrence_end and its schedule's season window. The daily cron keeps
 *  extending it, so there is no calendar-year cap. */
const DEFAULT_LOOKAHEAD_DAYS = 365;
/** Hard cap on visits inserted per call — only trips on a mis-configured job. */
const MAX_VISITS_PER_RUN = 400;

const Body = z.object({
  jobId: z.string().uuid(),
  lookaheadDays: z.number().int().min(1).max(730).optional(),
  /**
   * generate           — top up missing visits (default)
   * preview_reschedule — how many untouched future visits a schedule edit would remove
   * reschedule         — remove those visits, then regenerate on the job's (saved) schedule
   */
  action: z.enum(["generate", "preview_reschedule", "reschedule"]).optional(),
  /** schedule / schedule_days / recurrence_start changed → replace ALL untouched future visits. */
  scheduleChanged: z.boolean().optional(),
  /** preview only: the pending recurrence_end (reschedule reads the saved one). */
  recurrenceEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "jobId required" }, { status: 400 });
  const { jobId, lookaheadDays = DEFAULT_LOOKAHEAD_DAYS, action = "generate", scheduleChanged = false } = parsed.data;

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  const sessionOrgId: string | null = profile?.org_id ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: job, error: jobErr } = await (supabase as any)
    .from("crm_jobs")
    .select(GENERATOR_JOB_COLUMNS)
    .eq("id", jobId)
    .is("deleted_at", null)
    .single();
  if (jobErr || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const j = job as GeneratorJob;

  // The job is fetched under the caller's RLS, so the session org is its org.
  const orgId = j.org_id ?? sessionOrgId;
  const today = todayInZone(await getOrgTimeZone(supabase, orgId));

  // ── schedule-change pruning ───────────────────────────────────────────────
  // Untouched = status 'scheduled', never clocked in, not invoiced, on/after
  // the org's today. A schedule change replaces all of them; a shortened end
  // date only removes the ones past the new end.
  const pruneScope = (endDate: string | null | undefined) =>
    scheduleChanged
      ? { fromDate: today, statuses: SCHEDULE_CHANGE_PRUNE_STATUSES }
      : endDate
        ? { fromDate: today, afterDate: endDate, statuses: SCHEDULE_CHANGE_PRUNE_STATUSES }
        : null;

  if (action === "preview_reschedule") {
    const scope = pruneScope(parsed.data.recurrenceEnd ?? null);
    const ids = scope ? await findUntouchedFutureVisits(supabase, jobId, scope) : [];
    return NextResponse.json({ removeCount: ids.length });
  }

  let removed = 0;
  if (action === "reschedule") {
    const scope = pruneScope(j.recurrence_end);
    if (scope) {
      try {
        const ids = await findUntouchedFutureVisits(supabase, jobId, scope);
        removed = await pruneVisits(supabase, ids, scope.statuses);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to remove old visits" }, { status: 500 });
      }
    }
  }

  if (j.status && NON_GENERATING_JOB_STATUSES.includes(j.status)) {
    return NextResponse.json({ generated: 0, removed, message: `Job is ${j.status}.` });
  }

  const result = await generateVisitsForJobs(supabase, [j], {
    horizonDays: lookaheadDays,
    maxVisitsPerJob: MAX_VISITS_PER_RUN,
    fallbackOrgId: sessionOrgId,
    todayFor: async () => today,
  });
  if (result.errors.length > 0 && result.inserted === 0) {
    return NextResponse.json({ error: result.errors[0], removed }, { status: 500 });
  }

  return NextResponse.json({
    generated: result.inserted,
    removed,
    ...(result.inserted === 0 ? { message: "All visits already exist." } : {}),
  });
}
