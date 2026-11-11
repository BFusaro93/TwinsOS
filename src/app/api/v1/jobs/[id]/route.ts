import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { isUuid } from "../../id-param";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { JOB_SELECT, shapeJob } from "../shape";
import { updateJobSchema } from "../validation";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { propagateCrewToVisits } from "@/lib/visits/propagate-crew";
import { applyJobStatusToVisits } from "@/lib/visits/job-status-visits";
import { GENERATOR_JOB_COLUMNS, generateVisitsForJobs, type GeneratorJob } from "@/lib/visits/generate";
import { logger } from "@/lib/logger";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { firstIssueMessage } from "@/lib/utils/zod-message";

const log = logger.child("api/v1/jobs");

/** GET /api/v1/jobs/[id] — fetch one job. Requires scope "jobs:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  // A non-uuid id reached Postgres as a cast error and came back a 500.
  if (!isUuid(id)) return jsonError("Job not found", 404);

  const { data, error } = await db
    .from("crm_jobs")
    .select(JOB_SELECT)
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return jsonServerError("GET /api/v1/jobs/[id]", error);
  if (!data) return jsonError("Job not found", 404);
  return NextResponse.json(shapeJob(data));
}

/** PATCH /api/v1/jobs/[id] — updates a job. Requires scope "jobs:write:safe". */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);
  // A non-uuid id reached Postgres as a cast error and came back a 500.
  if (!isUuid(id)) return jsonError("Job not found", 404);

  const parsed = updateJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(firstIssueMessage(parsed.error, "Invalid input"), 400);
  const body = parsed.data;

  if (Object.keys(body).length === 0) return jsonError("No fields to update", 400);

  if (body.crewId) {
    const { data: crew } = await db
      .from("crm_crews")
      .select("org_id")
      .eq("id", body.crewId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!crew || crew.org_id !== auth.orgId) return jsonError("Crew not found", 404);
  }

  // The job as it is now — a status or crew change has to be compared against
  // it so the visits follow, exactly as they do for an edit made in the app.
  const { data: before } = await db
    .from("crm_jobs")
    .select("job_type, status, crew_id, client_id")
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!before) return jsonError("Job not found", 404);

  // scheduledDate used to rewrite only crm_jobs.scheduled_date — the job's
  // ORIGINAL start date — while the visit on the dispatch board stayed put, so
  // the API reported a reschedule that never happened. A job with a single
  // untouched visit moves that visit too; anything else is a per-visit
  // decision for the app.
  type MovableVisit = { id: string; occurrence_date: string | null; job_service_id: string | null };
  let visitToMove: MovableVisit | null = null;
  if (body.scheduledDate !== undefined) {
    const { data: visits, error: visitsError } = await db
      .from("crm_job_visits")
      .select("id, status, dispatched_at, clocked_in_at, completed_at, occurrence_date, job_service_id")
      .eq("org_id", auth.orgId)
      .eq("job_id", id)
      .is("deleted_at", null)
      .not("status", "in", "(cancelled,skipped)");
    if (visitsError) return jsonServerError("PATCH /api/v1/jobs/[id] (visits)", visitsError);
    const live = visits ?? [];
    if (live.length > 1) {
      return jsonError(
        "This job has more than one visit, so scheduledDate can't say which one to move. Reschedule the individual visits in the app (Dispatch Board, or the job's visits).",
        400
      );
    }
    if (live.length === 1) {
      const v = live[0];
      const untouched = v.status === "scheduled" && !v.dispatched_at && !v.clocked_in_at && !v.completed_at;
      if (!untouched) {
        return jsonError("This job's visit is already dispatched, started or completed, so it can't be rescheduled through the API. Reschedule it in the app.", 400);
      }
      if (body.scheduledDate === null) {
        return jsonError("scheduledDate can't be cleared while the job has a scheduled visit. Cancel the visit in the app instead.", 400);
      }
      visitToMove = { id: v.id as string, occurrence_date: v.occurrence_date as string | null, job_service_id: v.job_service_id as string | null };
    }
  }

  // rateCents used to rewrite only crm_jobs.rate_cents, which a job with
  // service lines ignores (each line carries its own rate). One line: the rate
  // is that line's. Several: there's no single rate to set.
  let serviceToReprice: string | null = null;
  if (body.rateCents !== undefined) {
    const { data: services, error: servicesError } = await db
      .from("crm_job_services")
      .select("id")
      .eq("org_id", auth.orgId)
      .eq("job_id", id);
    if (servicesError) return jsonServerError("PATCH /api/v1/jobs/[id] (services)", servicesError);
    if ((services ?? []).length > 1) {
      return jsonError("This job has more than one service line, so a single rateCents is ambiguous. Change each service's rate in the app.", 400);
    }
    if ((services ?? []).length === 1) serviceToReprice = services![0].id as string;
  }

  // Children first, so a failure here leaves the job exactly as it was.
  if (visitToMove && body.scheduledDate) {
    const { data: moved, error: moveError } = await db
      .from("crm_job_visits")
      .update({
        scheduled_date: body.scheduledDate,
        // A recurring/package visit is identified by its occurrence; keep the
        // two in step or the generator re-creates a visit on the old date.
        ...(visitToMove.occurrence_date && { occurrence_date: body.scheduledDate }),
      })
      .eq("id", visitToMove.id)
      .eq("org_id", auth.orgId)
      // Re-checked in the write: a crew may have been dispatched meanwhile.
      .eq("status", "scheduled")
      .is("dispatched_at", null)
      .is("clocked_in_at", null)
      .select("id");
    if (moveError) return jsonServerError("PATCH /api/v1/jobs/[id] (move visit)", moveError);
    if ((moved ?? []).length === 0) {
      return jsonError("This job's visit was dispatched or started while the request ran, so it was not rescheduled. Reschedule it in the app.", 409);
    }
  }
  if (serviceToReprice) {
    const { error: repriceError } = await db
      .from("crm_job_services")
      .update({ rate_cents: body.rateCents })
      .eq("id", serviceToReprice)
      .eq("org_id", auth.orgId);
    if (repriceError) return jsonServerError("PATCH /api/v1/jobs/[id] (service rate)", repriceError);
  }

  const { data, error } = await db
    .from("crm_jobs")
    .update({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.subStatus !== undefined && { sub_status: body.subStatus }),
      ...(body.scheduledDate !== undefined && { scheduled_date: body.scheduledDate }),
      ...(body.crewId !== undefined && { crew_id: body.crewId }),
      ...(body.rateCents !== undefined && { rate_cents: body.rateCents }),
      ...(body.notesToCrew !== undefined && { notes_to_crew: body.notesToCrew }),
      ...(body.completionNotes !== undefined && { completion_notes: body.completionNotes }),
    })
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .select(JOB_SELECT)
    .maybeSingle();

  if (error) return jsonServerError("PATCH /api/v1/jobs/[id]", error);
  if (!data) return jsonError("Job not found", 404);

  // Same visit rules as the app (src/lib/visits/*): hold, cancel — and, for a
  // recurring or package job, completed — removes the untouched upcoming
  // visits (no prompt here). The job row is already saved, so a failure here
  // is logged, not surfaced as a failed update.
  try {
    const today = todayInZone(await getOrgTimeZone(db, auth.orgId));

    if (body.crewId !== undefined && body.crewId !== before.crew_id) {
      const res = await propagateCrewToVisits(db, { jobId: id, crewId: body.crewId, fromDate: today, previousCrewId: (before.crew_id as string | null) ?? null });
      if (res.error) log.error("crew propagation failed", { jobId: id, error: res.error });
    }

    if (body.status !== undefined && body.status !== before.status) {
      const effect = await applyJobStatusToVisits(db, {
        jobId: id,
        jobType: before.job_type as string | null,
        previousStatus: before.status as string | null,
        newStatus: body.status,
        today,
      });
      if (effect.regenerate) {
        // Resumed from hold / cancelled / completed: regenerate the season, as the app's
        // resume does (365-day horizon, the same generator as the cron).
        const { data: genJob } = await db
          .from("crm_jobs")
          .select(GENERATOR_JOB_COLUMNS)
          .eq("org_id", auth.orgId)
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle();
        if (genJob) {
          const result = await generateVisitsForJobs(db, [genJob as unknown as GeneratorJob], {
            horizonDays: 365,
            maxVisitsPerJob: 400,
            fallbackOrgId: auth.orgId,
            todayFor: async () => today,
          });
          if (result.errors.length > 0) log.error("visit regeneration failed", { jobId: id, error: result.errors[0] });
        }
      }
    }
  } catch (e) {
    log.error("visit propagation threw", { jobId: id, error: e instanceof Error ? e.message : String(e) });
  }

  // Moving the visit is a visit date change, as in the app (useUpdateVisit).
  if (visitToMove && before.client_id) {
    try {
      let matchValues: string[] | undefined;
      if (visitToMove.job_service_id) {
        const { data: svc } = await db.from("crm_job_services").select("service_id").eq("id", visitToMove.job_service_id).maybeSingle();
        if (svc?.service_id) matchValues = [svc.service_id as string];
      }
      await fireSimpleTrigger(db, { orgId: auth.orgId, clientId: before.client_id as string, triggerType: "visit_date_changed", matchValues, recordId: visitToMove.id });
    } catch {
      // enrollment failure must not fail the update
    }
  }

  // The app's job status change fires job_cancelled (useUpdateJobStatus);
  // without it a job cancelled through the API never reached those
  // automations or Zapier hooks. Best-effort.
  if (body.status === "cancelled" && before.status !== "cancelled" && before.client_id) {
    try {
      await fireSimpleTrigger(db, { orgId: auth.orgId, clientId: before.client_id as string, triggerType: "job_cancelled" });
    } catch {
      // enrollment failure must not fail the update
    }
  }

  return NextResponse.json(shapeJob(data));
}
