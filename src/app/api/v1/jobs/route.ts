import { NextResponse } from "next/server";
import { adminClient, authenticateApiRequest } from "@/lib/api/auth";
import { jsonError, jsonServerError, parsePagination } from "@/lib/api/route-helpers";
import { JOB_SELECT, shapeJob } from "./shape";
import { createJobSchema } from "./validation";
import { isoNy } from "@/lib/reports/ny-date";
import { roundHours } from "@/lib/utils";

/** GET /api/v1/jobs — list the org's Landscapt jobs. Requires scope "jobs:read". */
export async function GET(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:read", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const { limit, offset } = parsePagination(request.url);
  const { data, error } = await db
    .from("crm_jobs")
    .select(JOB_SELECT)
    .eq("org_id", auth.orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return jsonServerError("GET /api/v1/jobs", error);
  return NextResponse.json({ data: (data ?? []).map(shapeJob), limit, offset });
}

/** POST /api/v1/jobs — creates a job. Requires scope "jobs:write:safe". */
export async function POST(request: Request) {
  const db = adminClient();
  const auth = await authenticateApiRequest(request, "jobs:write:safe", db);
  if (!auth.ok) return jsonError(auth.error, auth.status);

  const parsed = createJobSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Invalid input", 400);
  const body = parsed.data;

  const { data: client } = await db
    .from("clients")
    .select("org_id")
    .eq("id", body.clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client || client.org_id !== auth.orgId) return jsonError("Client not found", 404);

  if (body.propertyId) {
    const { data: property } = await db
      .from("client_properties")
      .select("org_id, client_id")
      .eq("id", body.propertyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!property || property.org_id !== auth.orgId) return jsonError("Property not found", 404);
    // Same org isn't enough: a property belonging to a DIFFERENT client of
    // the same org would be accepted and the crew would drive to the wrong
    // house.
    if (property.client_id !== body.clientId) {
      return jsonError("Property does not belong to the specified client", 400);
    }
  }
  if (body.crewId) {
    const { data: crew } = await db
      .from("crm_crews")
      .select("org_id")
      .eq("id", body.crewId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!crew || crew.org_id !== auth.orgId) return jsonError("Crew not found", 404);
  }
  if (body.salesRepId) {
    const { data: rep } = await db
      .from("crm_employees")
      .select("org_id")
      .eq("id", body.salesRepId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rep || rep.org_id !== auth.orgId) return jsonError("Sales rep not found", 404);
  }

  let serviceName: string | null = null;
  if (body.serviceId) {
    const { data: service } = await db
      .from("crm_services")
      .select("org_id, name")
      .eq("id", body.serviceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!service || service.org_id !== auth.orgId) return jsonError("Service not found", 404);
    serviceName = body.serviceName ?? (service.name as string);
  }

  const menCount = body.menCount ?? 1;
  const jobType = body.jobType ?? "one_time";

  // A waiting_list job is BY DEFINITION not on the board: it has a date
  // window and gets dispatched opportunistically when a crew is nearby (see
  // CLAUDE.md "WaitingList"). Creating a firm dated visit for one put it on
  // the dispatch board as a fixed stop — the one thing the waiting list
  // exists to avoid — so its date becomes the window instead of a schedule.
  const isWaitingList = jobType === "waiting_list";
  const scheduledDate = isWaitingList ? null : (body.scheduledDate ?? null);

  const { data, error } = await db
    .from("crm_jobs")
    .insert({
      org_id: auth.orgId,
      client_id: body.clientId,
      property_id: body.propertyId ?? null,
      job_type: jobType,
      scheduled_date: scheduledDate,
      // A waiting_list job's date is its availability window, not a booking.
      ...(isWaitingList &&
        body.scheduledDate && {
          waiting_list_start: body.scheduledDate,
          waiting_list_end: body.waitingListEnd ?? body.scheduledDate,
        }),
      crew_id: body.crewId ?? null,
      rate_cents: body.rateCents ?? null,
      notes_to_crew: body.notesToCrew ?? null,
      sales_rep_id: body.salesRepId ?? null,
      // Date Sold feeds the Sales by Date Sold / Approved Sales by Sales Rep reports.
      date_sold: body.dateSold ?? isoNy(new Date()),
      status: "scheduled",
      man_count: menCount,
      // crm_jobs.budgeted_hours is the MAN-HOUR rollup — the same unit
      // budgetedHours is documented in, so it goes in as given. (The
      // crm_job_services AFTER INSERT trigger recomputes it below as
      // Σ(service.budgeted_hours × team_size), which lands on the same
      // figure because the service row stores the per-person split.)
      budgeted_hours: body.budgetedHours ?? null,
    })
    .select(JOB_SELECT)
    .single();

  if (error || !data) return jsonServerError("POST /api/v1/jobs", error);
  const job = data;
  // Captured outside rollback(): TypeScript's narrowing of the `auth` union
  // doesn't survive into a nested function declaration.
  const orgId = auth.orgId;

  /**
   * Undoes everything this request created, child rows first, and returns
   * the caller's error response.
   *
   * These inserts are not in a transaction (PostgREST gives us no way to
   * open one), so without a compensating rollback a failed child insert left
   * a half-built job behind: a serviced job with no visit is invisible on
   * the dispatch board, has nothing to complete or invoice against, and has
   * already consumed a job_number. The PO route does the same for its own
   * header (src/app/api/v1/purchase-orders/route.ts).
   *
   * Soft delete per CLAUDE.md's soft-deletes-only rule — the rows are
   * seconds old and the caller is being told the request failed, so they
   * must not appear anywhere, but they stay auditable.
   */
  async function rollback(context: string, cause: unknown) {
    const deletedAt = new Date().toISOString();
    await db.from("crm_job_visits").update({ deleted_at: deletedAt }).eq("job_id", job.id);
    // crm_job_services is the one table here with no deleted_at column, so a
    // hard delete is the only option — and it's the right one: leaving the
    // service row would keep firing the budgeted-hours rollup trigger against
    // a job that no longer exists.
    await db.from("crm_job_services").delete().eq("job_id", job.id);
    await db.from("crm_jobs").update({ deleted_at: deletedAt }).eq("id", job.id).eq("org_id", orgId);
    return jsonServerError(context, cause);
  }

  // Same two inserts useCreateClientJob does for its simplest single-service
  // case — without these, the job has no line item and (if scheduled) no
  // visit, so it never shows up correctly on the Dispatch Board or has
  // anything to complete/invoice against.
  if (body.serviceId && serviceName) {
    const { data: jobService, error: serviceError } = await db
      .from("crm_job_services")
      .insert({
        org_id: auth.orgId,
        job_id: job.id,
        service_id: body.serviceId,
        service_name: serviceName,
        qty: body.qty ?? 1,
        rate_cents: body.rateCents ?? null,
        team_size: menCount,
        // budgetedHours is MAN-hours (hours × crew size), matching the
        // estimate engine and crm_jobs.budgeted_hours.
        // crm_job_services.budgeted_hours is PER-PERSON, and
        // trg_crm_job_services_recompute_budgeted_hours rolls the job up as
        // Σ(budgeted_hours × team_size) — so writing the man-hour figure
        // straight in alongside team_size = crew size multiplied it a second
        // time: {menCount: 3, budgetedHours: 10} budgeted the job at 30
        // hours, inflating every budget-vs-actual variance and
        // revenue-per-man-hour by the crew size. Same split
        // use-crm-jobs.ts:1950 already applies on the estimate → job path.
        budgeted_hours: roundHours((body.budgetedHours ?? 0) / menCount),
        sort_order: 0,
      })
      .select("id")
      .single();

    if (serviceError || !jobService) return rollback("POST /api/v1/jobs (service)", serviceError);

    if (scheduledDate) {
      const { error: visitError } = await db.from("crm_job_visits").insert({
        org_id: auth.orgId,
        job_id: job.id,
        client_id: body.clientId,
        job_service_id: jobService.id,
        scheduled_date: scheduledDate,
        status: "scheduled",
        crew_id: body.crewId ?? null,
        men_count: menCount,
      });
      if (visitError) return rollback("POST /api/v1/jobs (visit)", visitError);
    }
  }

  // Same client-timeline row the in-app New Job dialog writes (see
  // useCreateClientJob). Admin client → org_id must be explicit (no
  // my_org_id() session default here). Best-effort, and written LAST so a
  // rolled-back job never leaves a "Job created" entry on the client's
  // timeline pointing at a row nobody can open.
  await db.from("client_activity").insert({
    org_id: auth.orgId,
    client_id: body.clientId,
    activity_type: "job",
    subject: `Job created: ${jobType.replace(/_/g, " ")}`,
    ref_id: job.id,
    ref_table: "crm_jobs",
  });

  return NextResponse.json(shapeJob(job), { status: 201 });
}
