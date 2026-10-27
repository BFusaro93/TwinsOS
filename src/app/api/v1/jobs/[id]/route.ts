import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError } from "@/lib/api/route-helpers";
import { JOB_SELECT, shapeJob } from "../shape";
import { updateJobSchema } from "../validation";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { propagateCrewToVisits } from "@/lib/visits/propagate-crew";
import { applyJobStatusToVisits } from "@/lib/visits/job-status-visits";
import { GENERATOR_JOB_COLUMNS, generateVisitsForJobs, type GeneratorJob } from "@/lib/visits/generate";
import { logger } from "@/lib/logger";

const log = logger.child("api/v1/jobs");

/** GET /api/v1/jobs/[id] — fetch one job. Requires scope "jobs:read". */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

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

  const parsed = updateJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
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
    .select("job_type, status, crew_id")
    .eq("org_id", auth.orgId)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!before) return jsonError("Job not found", 404);

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

  // Same visit rules as the app (src/lib/visits/*). The job row is already
  // saved, so a failure here is logged, not surfaced as a failed update.
  try {
    const today = todayInZone(await getOrgTimeZone(db, auth.orgId));

    if (body.crewId !== undefined && body.crewId !== before.crew_id) {
      const res = await propagateCrewToVisits(db, { jobId: id, crewId: body.crewId, fromDate: today });
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
        // Resumed from hold / cancelled: regenerate the season, as the app's
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

  return NextResponse.json(shapeJob(data));
}
