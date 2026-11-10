import type { SupabaseClient } from "@supabase/supabase-js";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { roundHours } from "@/lib/utils";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { jobActivityLabel } from "@/lib/utils/job-activity-label";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export type CrmJobType = "recurring" | "one_time" | "waiting_list" | "package" | "snow" | "project";

/** Already-validated input (dates are YYYY-MM-DD; money in cents). */
export interface CreateCrmJobInput {
  clientId: string;
  propertyId?: string;
  jobType?: CrmJobType;
  scheduledDate?: string;
  waitingListEnd?: string;
  crewId?: string;
  rateCents?: number;
  notesToCrew?: string;
  /** Office notes (crm_jobs.notes). */
  notes?: string;
  dateSold?: string;
  salesRepId?: string;
  serviceId?: string;
  serviceName?: string;
  qty?: number;
  menCount?: number;
  /** TOTAL man-hours for the job. */
  budgetedHours?: number;
}

export type CreateCrmJobResult =
  | { ok: true; job: Record<string, unknown> }
  /** Caller-facing 4xx (validation / not found). */
  | { ok: false; status: 400 | 404; error: string }
  /** Server-side failure: log `cause`, return a generic 500. */
  | { ok: false; status: 500; context: string; cause: unknown };

/**
 * Creates a Landscapt job the way the app's New Job dialog does for its
 * simplest single-service case. Shared by the public v1 API (POST
 * /api/v1/jobs) and the Zapier "Create Job" action so both get the same
 * rules: foreign ids checked against the org, a waiting_list job's date
 * stored as its window (never a board visit), a service line + visit when a
 * service is given, a compensating rollback if a child insert fails, the
 * client-timeline row and the job_created trigger.
 */
export async function createCrmJob(
  db: AnyClient,
  orgId: string,
  input: CreateCrmJobInput,
  opts: { select: string; context: string }
): Promise<CreateCrmJobResult> {
  const { data: client } = await db
    .from("clients")
    .select("org_id")
    .eq("id", input.clientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client || client.org_id !== orgId) return { ok: false, status: 404, error: "Client not found" };

  if (input.propertyId) {
    const { data: property } = await db
      .from("client_properties")
      .select("org_id, client_id")
      .eq("id", input.propertyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!property || property.org_id !== orgId) return { ok: false, status: 404, error: "Property not found" };
    // Same org isn't enough: a property belonging to a DIFFERENT client of
    // the same org would be accepted and the crew would drive to the wrong
    // house.
    if (property.client_id !== input.clientId) {
      return { ok: false, status: 400, error: "Property does not belong to the specified client" };
    }
  }
  if (input.crewId) {
    const { data: crew } = await db
      .from("crm_crews")
      .select("org_id")
      .eq("id", input.crewId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!crew || crew.org_id !== orgId) return { ok: false, status: 404, error: "Crew not found" };
  }
  if (input.salesRepId) {
    const { data: rep } = await db
      .from("crm_employees")
      .select("org_id")
      .eq("id", input.salesRepId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!rep || rep.org_id !== orgId) return { ok: false, status: 404, error: "Sales rep not found" };
  }

  let serviceName: string | null = null;
  if (input.serviceId) {
    const { data: service } = await db
      .from("crm_services")
      .select("org_id, name")
      .eq("id", input.serviceId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!service || service.org_id !== orgId) return { ok: false, status: 404, error: "Service not found" };
    serviceName = input.serviceName ?? (service.name as string);
  }

  const menCount = input.menCount ?? 1;
  const jobType: CrmJobType = input.jobType ?? "one_time";

  // A waiting_list job is BY DEFINITION not on the board: it has a date
  // window and gets dispatched opportunistically when a crew is nearby (see
  // CLAUDE.md "WaitingList"). Creating a firm dated visit for one put it on
  // the dispatch board as a fixed stop — the one thing the waiting list
  // exists to avoid — so its date becomes the window instead of a schedule.
  const isWaitingList = jobType === "waiting_list";
  const scheduledDate = isWaitingList ? null : (input.scheduledDate ?? null);

  const { data, error } = await db
    .from("crm_jobs")
    .insert({
      org_id: orgId,
      client_id: input.clientId,
      property_id: input.propertyId ?? null,
      job_type: jobType,
      scheduled_date: scheduledDate,
      // A waiting_list job's date is its availability window, not a booking.
      ...(isWaitingList &&
        input.scheduledDate && {
          waiting_list_start: input.scheduledDate,
          waiting_list_end: input.waitingListEnd ?? input.scheduledDate,
        }),
      crew_id: input.crewId ?? null,
      rate_cents: input.rateCents ?? null,
      notes_to_crew: input.notesToCrew ?? null,
      ...(input.notes !== undefined && { notes: input.notes }),
      sales_rep_id: input.salesRepId ?? null,
      // Date Sold feeds the Sales by Date Sold / Approved Sales by Sales Rep reports.
      date_sold: input.dateSold ?? todayInZone(await getOrgTimeZone(db, orgId)),
      status: "scheduled",
      man_count: menCount,
      // crm_jobs.budgeted_hours is the MAN-HOUR rollup — the same unit
      // budgetedHours is documented in, so it goes in as given. (The
      // crm_job_services AFTER INSERT trigger recomputes it below as
      // Σ(service.budgeted_hours × team_size), which lands on the same
      // figure because the service row stores the per-person split.)
      budgeted_hours: input.budgetedHours ?? null,
    })
    .select(opts.select)
    .single();

  if (error || !data) return { ok: false, status: 500, context: opts.context, cause: error };
  const job = data as unknown as Record<string, unknown>;
  const jobId = job.id as string;

  /**
   * Undoes everything this request created, child rows first.
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
  async function rollback(context: string, cause: unknown): Promise<CreateCrmJobResult> {
    const deletedAt = new Date().toISOString();
    // Unlinked as they are retired: crm_job_visits.job_service_id no longer
    // cascades to NULL (20261229000200), so a visit still pointing at the
    // service would block the delete below.
    await db.from("crm_job_visits").update({ deleted_at: deletedAt, job_service_id: null, occurrence_date: null }).eq("job_id", jobId);
    // crm_job_services is the one table here with no deleted_at column, so a
    // hard delete is the only option — and it's the right one: leaving the
    // service row would keep firing the budgeted-hours rollup trigger against
    // a job that no longer exists.
    await db.from("crm_job_services").delete().eq("job_id", jobId);
    await db.from("crm_jobs").update({ deleted_at: deletedAt }).eq("id", jobId).eq("org_id", orgId);
    return { ok: false, status: 500, context, cause };
  }

  // Same two inserts useCreateClientJob does for its simplest single-service
  // case — without these, the job has no line item and (if scheduled) no
  // visit, so it never shows up correctly on the Dispatch Board or has
  // anything to complete/invoice against.
  if (input.serviceId && serviceName) {
    const { data: jobService, error: serviceError } = await db
      .from("crm_job_services")
      .insert({
        org_id: orgId,
        job_id: jobId,
        service_id: input.serviceId,
        service_name: serviceName,
        qty: input.qty ?? 1,
        rate_cents: input.rateCents ?? null,
        team_size: menCount,
        // budgetedHours is MAN-hours (hours × crew size), matching the
        // estimate engine and crm_jobs.budgeted_hours.
        // crm_job_services.budgeted_hours is PER-PERSON, and
        // trg_crm_job_services_recompute_budgeted_hours rolls the job up as
        // Σ(budgeted_hours × team_size) — writing the man-hour figure
        // straight in alongside team_size = crew size multiplied it a second
        // time. Same split use-crm-jobs.ts already applies on the estimate →
        // job path.
        budgeted_hours: roundHours((input.budgetedHours ?? 0) / menCount),
        sort_order: 0,
      })
      .select("id")
      .single();

    if (serviceError || !jobService) return rollback(`${opts.context} (service)`, serviceError);

    if (scheduledDate) {
      const { error: visitError } = await db.from("crm_job_visits").insert({
        org_id: orgId,
        job_id: jobId,
        client_id: input.clientId,
        job_service_id: jobService.id,
        scheduled_date: scheduledDate,
        // A recurring / package job's visits are identified by their
        // occurrence (src/lib/visits/generate.ts), as estimate conversion and
        // New Job stamp it: without one, deleting this visit let the generator
        // re-create it on the same date.
        ...(jobType === "recurring" || jobType === "package" ? { occurrence_date: scheduledDate } : {}),
        status: "scheduled",
        crew_id: input.crewId ?? null,
        men_count: menCount,
      });
      if (visitError) return rollback(`${opts.context} (visit)`, visitError);
    }
  }

  // Same client-timeline row the in-app New Job dialog writes (see
  // useCreateClientJob). Admin client → org_id must be explicit (no
  // my_org_id() session default here). Best-effort, and written LAST so a
  // rolled-back job never leaves a "Job created" entry on the client's
  // timeline pointing at a row nobody can open.
  await db.from("client_activity").insert({
    org_id: orgId,
    client_id: input.clientId,
    activity_type: "job",
    subject: `Job created: ${jobActivityLabel({ jobType, serviceNames: [serviceName] })}`,
    ref_id: jobId,
    ref_table: "crm_jobs",
  });

  // The in-app New Job dialog fires job_created (which also feeds Zapier REST
  // hooks); without it a job made through the API never enrolled in
  // job_created automations. Best-effort.
  try {
    await fireSimpleTrigger(db, { orgId, clientId: input.clientId, triggerType: "job_created", matchValues: [jobType] });
  } catch {
    // enrollment failure must not fail the create
  }

  return { ok: true, job };
}
