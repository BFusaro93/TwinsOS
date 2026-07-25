"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMJob, CRMService, CRMCrew, CRMServiceRateMatrixRow, BudgetMethod } from "@/types/crm-jobs";

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapJob(row: any): CRMJob {
  return {
    id: row.id,
    orgId: row.org_id,
    clientId: row.client_id,
    propertyId: row.property_id,
    jobType: row.job_type,
    status: row.status,
    subStatus: row.sub_status,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    waitingListStart: row.waiting_list_start,
    waitingListEnd: row.waiting_list_end,
    recurrenceRule: row.recurrence_rule,
    recurrenceStart: row.recurrence_start,
    recurrenceEnd: row.recurrence_end,
    packageId: row.package_id,
    packageStep: row.package_step,
    packageTotalSteps: row.package_total_steps,
    crewId: row.crew_id,
    manCount: row.man_count ?? 1,
    rateCents: row.rate_cents,
    budgetedHours: row.budgeted_hours,
    actualHours: row.actual_hours,
    serviceAddress: row.service_address,
    serviceCity: row.service_city,
    serviceState: row.service_state,
    serviceZip: row.service_zip,
    mapCode: row.map_code,
    lastServiceDate: row.last_service_date,
    notesToCrew: row.notes_to_crew,
    completionNotes: row.completion_notes,
    invoiceDescription: row.invoice_description ?? null,
    contractId: row.contract_id ?? null,
    schedule: row.schedule ?? null,
    scheduleDays: row.schedule_days ?? [],
    packageName: row.package_name ?? null,
    packageRenewal: row.package_renewal ?? null,
    packageDiscount: row.package_discount ?? null,
    conflictDays: row.conflict_days ?? [],
    inchTrigger: row.inch_trigger ?? null,
    invoiceType: row.invoice_type ?? null,
    ratePerInchCents: row.rate_per_inch_cents ?? null,
    assetType: row.asset_type ?? null,
    salesRepId: row.sales_rep_id ?? null,
    source: row.source ?? null,
    paymentType: row.payment_type ?? null,
    poNumber: row.po_number ?? null,
    dateSold: row.date_sold ?? null,
    whenToInvoice: row.when_to_invoice ?? null,
    invoiceSeparately: row.invoice_separately ?? false,
    callAhead: row.call_ahead ?? false,
    arrivalWindowHours: row.arrival_window_hours ?? null,
    startDateWindow: row.start_date_window ?? null,
    endDateWindow: row.end_date_window ?? null,
    isComplete: row.is_complete ?? false,
    serviceTotalCents: row.service_total_cents ?? 0,
    productTotalCents: row.product_total_cents ?? 0,
    taxCents: row.tax_cents ?? 0,
    totalCents: row.total_cents ?? 0,
    notes: row.notes ?? null,
    projectId: row.project_id,
    estimateId: row.estimate_id ?? null,
    priority: row.priority ?? 1,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    // joined
    clientName: row.clients?.display_name ?? null,
    clientPhone: row.clients?.primary_phone ?? null,
    crewName: row.crm_crews?.name ?? null,
    salesRepName: row.profiles?.name ?? null,
    services: (row.crm_job_services ?? []).map(mapJobServiceFull),
    visits: row.crm_job_visits
      ? (row.crm_job_visits as { id: string; scheduled_date: string; status: string; deleted_at: string | null; job_service_id: string | null; crm_crews: { name: string } | null }[])
          .filter((v) => !v.deleted_at)
          .map((v) => ({ id: v.id, scheduledDate: v.scheduled_date, status: v.status as VisitStatus, crewName: v.crm_crews?.name ?? null, jobServiceId: v.job_service_id ?? null }))
      : undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapService(row: any): CRMService {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    code: row.code,
    category: row.category,
    defaultRateCents: row.default_rate_cents,
    productionRateSqftPerHr: row.production_rate_sqft_per_hr ? Number(row.production_rate_sqft_per_hr) : null,
    budgetMethod: row.budget_method ?? 'manual',
    unit: row.unit ?? 'visit',
    isActive: row.is_active,
    parentServiceId: row.parent_service_id ?? null,
    serviceMode: row.service_mode ?? 'flat_rate',
    defaultBHrs: Number(row.default_b_hrs ?? 0),
    defaultBCostCents: row.default_b_cost_cents ?? 0,
    showInSnowDispatch: row.show_in_snow_dispatch ?? false,
    onlyForEstimates: row.only_for_estimates ?? false,
    trackChemicals: row.track_chemicals ?? false,
    invoiceDescription: row.invoice_description ?? null,
    descriptionOnEstimate: row.description_on_estimate ?? null,
    callScriptNotes: row.call_script_notes ?? null,
    taskColor: row.task_color ?? '#3B82F6',
    targetRateCents: row.target_rate_cents_per_hr ?? 0,
    targetRateWithDriveCents: row.target_rate_with_drive_cents_per_hr ?? 0,
    rateMatrixField: row.rate_matrix_field ?? null,
    rateMatrixCalc: row.rate_matrix_calc ?? 'qty_x_rate_x_visits',
    matrixTailEveryQty: row.matrix_tail_every_qty ? Number(row.matrix_tail_every_qty) : null,
    matrixTailOverQty: row.matrix_tail_over_qty ? Number(row.matrix_tail_over_qty) : null,
    matrixTailRateCents: row.matrix_tail_rate_cents ?? null,
    matrixTailHours: row.matrix_tail_hours ? Number(row.matrix_tail_hours) : null,
    matrixTailCostCents: row.matrix_tail_cost_cents ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCrew(row: any): CRMCrew {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    color: row.color,
    isActive: row.is_active,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

// ── dispatch board: jobs for a specific date ──────────────────────────────────

export function useJobsForDate(date: string) {
  return useQuery({
    queryKey: ["crm-jobs", "date", date],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_jobs")
        .select(`
          *,
          clients(display_name, primary_phone),
          crm_crews(name),
          profiles!crm_jobs_sales_rep_id_fkey(name),
          crm_job_services(*)
        `)
        .eq("scheduled_date", date)
        .is("deleted_at", null)
        .order("priority", { ascending: true })
        .order("start_time", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data.map(mapJob)) as CRMJob[];
    },
    enabled: !!date,
  });
}

// ── waiting list ──────────────────────────────────────────────────────────────

export function useWaitingListJobs(startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["crm-jobs", "waiting-list", startDate, endDate],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_jobs")
        .select(`
          *,
          clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
          crm_crews(name),
          profiles!crm_jobs_sales_rep_id_fkey(name),
          crm_job_services(*),
          crm_job_visits(id, deleted_at, job_service_id, status)
        `)
        .in("job_type", ["waiting_list", "package"])
        .is("deleted_at", null)
        .order("waiting_list_start", { ascending: true });

      // Include jobs with null dates (not yet scheduled into a window) alongside date-filtered ones
      if (startDate) q = q.or(`waiting_list_end.is.null,waiting_list_end.gte.${startDate}`);
      if (endDate)   q = q.or(`waiting_list_start.is.null,waiting_list_start.lte.${endDate}`);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await q;
      if (error) throw error;

      // A one-time waiting-list job that's already been dispatched (has an active
      // visit) is done waiting — drop it. Packages keep multiple visits over their
      // lifetime, so they stay until their date window says otherwise.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data as any[]).filter((row) => {
        if (row.job_type !== "waiting_list") return true;
        const hasActiveVisit = (row.crm_job_visits ?? []).some((v: any) => !v.deleted_at);
        return !hasActiveVisit;
      });

      // Package jobs' visits are often bulk-generated up front for the whole
      // season (one placeholder per service, status='scheduled', sometimes
      // with a crew pre-assigned) well before anyone actually dispatches them
      // — that's not the same as being handled. Only drop a service once it
      // has a visit that's actually moved past that placeholder state (i.e.
      // been dispatched, worked, or resolved); a still-'scheduled' visit means
      // the service is still exactly what the Waiting List is for.
      for (const row of rows) {
        if (row.job_type !== "package") continue;
        const dispatchedServiceIds = new Set(
          (row.crm_job_visits ?? [])
            .filter((v: any) => !v.deleted_at && v.job_service_id && v.status !== "scheduled")
            .map((v: any) => v.job_service_id)
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        row.crm_job_services = (row.crm_job_services ?? []).filter(
          (s: any) => !dispatchedServiceIds.has(s.id)
        );
      }

      return (rows.map((row) => mapJob({
        ...row,
        service_address: row.service_address ?? row.clients?.billing_address ?? null,
        service_city:    row.service_city    ?? row.clients?.billing_city    ?? null,
        service_state:   row.service_state   ?? row.clients?.billing_state   ?? null,
        service_zip:     row.service_zip     ?? row.clients?.billing_zip     ?? null,
      }))) as CRMJob[];
    },
  });
}

// ── services catalog ──────────────────────────────────────────────────────────

export function useCRMServices() {
  return useQuery({
    queryKey: ["crm-services"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_services")
        .select("*")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapService)) as CRMService[];
    },
  });
}

// ── crews ─────────────────────────────────────────────────────────────────────

export function useCRMCrews() {
  return useQuery({
    queryKey: ["crm-crews"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_crews")
        .select("*")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapCrew)) as CRMCrew[];
    },
  });
}

// ── mutations ─────────────────────────────────────────────────────────────────

export function useUpdateJobStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      scheduledDate,
      clientId,
    }: {
      id: string;
      status: string;
      scheduledDate: string;
      clientId?: string;
    }) => {
      const supabase = createClient();

      // Never mark multi-visit job types as completed via a direct status update —
      // only their individual visits complete. Keep job at scheduled.
      let resolvedStatus = status;
      if (status === "completed") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: jobRow } = await (supabase as any).from("crm_jobs").select("job_type").eq("id", id).single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const multiVisitTypes = ["recurring", "waiting_list", "package", "snow", "project"];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (jobRow && multiVisitTypes.includes((jobRow as any).job_type)) {
          resolvedStatus = "scheduled";
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_jobs")
        .update({ status: resolvedStatus })
        .eq("id", id);
      if (error) throw error;

      // Log to client activity timeline
      const resolvedClientId = clientId ?? await (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any).from("crm_jobs").select("client_id").eq("id", id).single();
        return data?.client_id as string | null;
      })();
      if (resolvedClientId) {
        const label = status.replace(/_/g, " ");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("client_activity").insert({
          client_id: resolvedClientId,
          activity_type: "job",
          subject: `Job ${label}`,
          ref_id: id,
          ref_table: "crm_jobs",
        });
      }

      return { scheduledDate };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-jobs", "date", vars.scheduledDate] });
      if (vars.clientId) qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

export function useAssignCrew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      crewId,
      scheduledDate,
    }: {
      id: string;
      crewId: string | null;
      scheduledDate: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_jobs")
        .update({ crew_id: crewId })
        .eq("id", id);
      if (error) throw error;
      return { scheduledDate };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-jobs", "date", vars.scheduledDate] });
    },
  });
}

// ── client-facing job list ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobFull(row: any): CRMJob {
  return {
    ...mapJob(row),
    contractId: row.contract_id ?? null,
    schedule: row.schedule ?? null,
    scheduleDays: row.schedule_days ?? [],
    packageName: row.package_name ?? null,
    packageRenewal: row.package_renewal ?? null,
    packageDiscount: row.package_discount ?? null,
    conflictDays: row.conflict_days ?? [],
    inchTrigger: row.inch_trigger ?? null,
    invoiceType: row.invoice_type ?? null,
    ratePerInchCents: row.rate_per_inch_cents ?? null,
    assetType: row.asset_type ?? null,
    source: row.source ?? null,
    paymentType: row.payment_type ?? null,
    poNumber: row.po_number ?? null,
    dateSold: row.date_sold ?? null,
    whenToInvoice: row.when_to_invoice ?? null,
    invoiceSeparately: row.invoice_separately ?? false,
    callAhead: row.call_ahead ?? false,
    arrivalWindowHours: row.arrival_window_hours ?? null,
    startDateWindow: row.start_date_window ?? null,
    endDateWindow: row.end_date_window ?? null,
    isComplete: row.is_complete ?? false,
    serviceTotalCents: row.service_total_cents ?? 0,
    productTotalCents: row.product_total_cents ?? 0,
    taxCents: row.tax_cents ?? 0,
    totalCents: row.total_cents ?? 0,
    notes: row.notes ?? null,
    services: (row.crm_job_services ?? []).map(mapJobServiceFull),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJobServiceFull(s: any): CRMJobService {
  return {
    id: s.id,
    jobId: s.job_id,
    serviceId: s.service_id ?? null,
    serviceName: s.service_name ?? '',
    qty: s.qty ?? 1,
    rateCents: s.rate_cents ?? null,
    startDate: s.start_date ?? null,
    completeByDate: s.complete_by_date ?? null,
    startRecurring: s.start_recurring ?? null,
    assignedTo: s.assigned_to ?? null,
    budgetedHours: s.budgeted_hours ?? 0,
    budgetMethod: s.budget_method ?? 'manual',
    teamSize: s.team_size ?? 1,
    daysCount: s.days_count ?? 1,
    timeStart: s.time_start ?? null,
    timeEnd: s.time_end ?? null,
    included: s.included ?? true,
    sortOrder: s.sort_order ?? 0,
  };
}

export function useClientJobs(clientId?: string) {
  return useQuery({
    queryKey: ['crm-jobs', 'client', clientId],
    queryFn: async () => {
      const supabase = createClient();
      let q = supabase
        .from('crm_jobs')
        .select('*, crm_job_services(*), clients(display_name, primary_phone), profiles!crm_jobs_sales_rep_id_fkey(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (clientId) q = q.eq('client_id', clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data.map(mapJobFull)) as CRMJob[];
    },
    enabled: clientId !== undefined ? !!clientId : true,
  });
}

import type { NewClientJobFormValues, CRMJobService, CRMJobVisit, VisitStatus } from '@/types/crm-jobs';

// ── visit helpers ─────────────────────────────────────────────────────────────

// When a visit has no rate_cents / budgeted_hours of its own, fall back to the
// sum of the parent job's services (the common case for auto-generated visits).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyJobServiceFallback(visit: CRMJobVisit, row: any): CRMJobVisit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: any[] = row.crm_jobs?.crm_job_services ?? [];
  if (visit.rateCents == null) {
    const total = services.reduce((sum: number, s: any) => sum + (s.rate_cents ?? 0) * (s.qty ?? 1), 0);
    if (total > 0) visit.rateCents = total;
    // Also try direct job rate_cents
    if (visit.rateCents == null && row.crm_jobs?.rate_cents != null) visit.rateCents = row.crm_jobs.rate_cents;
  }
  if (visit.budgetedHours == null) {
    const total = services.reduce((sum: number, s: any) => sum + (Number(s.budgeted_hours) ?? 0) * (s.qty ?? 1), 0);
    if (total > 0) visit.budgetedHours = total;
    if (visit.budgetedHours == null && row.crm_jobs?.budgeted_hours != null) visit.budgetedHours = Number(row.crm_jobs.budgeted_hours);
  }
  if (services.length > 0) {
    visit.serviceNames = services.map((s: any) => s.service_name as string).filter(Boolean);
    visit.serviceIds = services.map((s: any) => (s.service_id as string | null) ?? null);
  }
  return visit;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapVisit(row: any): CRMJobVisit {
  return {
    id: row.id,
    orgId: row.org_id,
    jobId: row.job_id,
    clientId: row.client_id,
    jobServiceId: row.job_service_id ?? null,
    stormEventId: row.storm_event_id ?? null,
    snowDepthInches: row.snow_depth_inches ?? null,
    temperature: row.temperature ?? null,
    assetType: row.asset_type ?? null,
    materialsUsed: Array.isArray(row.materials_used)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? row.materials_used.map((m: any) => ({ name: m.name ?? '', qty: Number(m.qty ?? 0), rateCents: Number(m.rate_cents ?? m.rateCents ?? 0) }))
      : [],
    clientName: row.clients?.display_name ?? null,
    clientPhone: row.clients?.primary_phone ?? null,
    crewId: row.crew_id ?? null,
    crewName: row.crm_crews?.name ?? null,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    status: row.status,
    subStatus: row.sub_status ?? null,
    orderNum: row.order_num ?? null,
    completionNotes: row.completion_notes ?? null,
    actualHours: row.actual_hours ?? null,
    budgetedHours: row.budgeted_hours ?? null,
    completedAt: row.completed_at ?? null,
    priority: row.priority ?? 1,
    notesToCrew: row.notes_to_crew ?? null,
    notesToClient: row.notes_to_client ?? null,
    invoiceDescription: row.invoice_description ?? null,
    menCount: row.men_count ?? 0,
    qty: row.qty ?? null,
    rateCents: row.rate_cents ?? null,
    jobComments: Array.isArray(row.job_comments)
      ? row.job_comments
      : typeof row.job_comments === "string" && row.job_comments
        ? [{ id: "crew-note", authorName: "Crew", authorId: "", text: row.job_comments as string, createdAt: (row.updated_at ?? row.created_at) as string }]
        : [],
    assignedEmployeeId:  row.assigned_employee_id ?? null,
    dispatchedAt:        row.dispatched_at ?? null,
    clockedInAt:         row.clocked_in_at ?? null,
    clockedOutAt:        row.clocked_out_at ?? null,
    acknowledgedNotesAt: row.acknowledged_notes_at ?? null,
    skipReason:          row.skip_reason ?? null,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
    deletedAt:           row.deleted_at ?? null,
    job: row.crm_jobs ? mapJob({
      ...row.crm_jobs,
      // Fall back to client billing address when job has no service address set
      service_address: row.crm_jobs.service_address ?? row.clients?.billing_address ?? null,
      service_city:    row.crm_jobs.service_city    ?? row.clients?.billing_city    ?? null,
      service_state:   row.crm_jobs.service_state   ?? row.clients?.billing_state   ?? null,
      service_zip:     row.crm_jobs.service_zip     ?? row.clients?.billing_zip     ?? null,
    }) : undefined,
  };
}

export function useVisitsForDate(fromDate: string, toDate?: string) {
  return useQuery({
    queryKey: ['crm-job-visits', 'date', fromDate, toDate ?? fromDate],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from('crm_job_visits')
        .select(`
          *,
          clients(display_name, primary_phone, billing_address, billing_city, billing_state, billing_zip),
          crm_crews(name),
          crm_jobs(*, crm_crews(name), crm_job_services(*))
        `)
        .is('deleted_at', null)
        .order('priority', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        // Final deterministic tiebreaker — visits sharing the same priority
        // (the common case before any manual route reorder) and no start_time
        // otherwise have no stable order, so Postgres can return them in a
        // different sequence on every refetch, which reads as "the route
        // reorders itself" after any unrelated edit.
        .order('created_at', { ascending: true });

      if (toDate && toDate !== fromDate) {
        q = q.gte('scheduled_date', fromDate).lte('scheduled_date', toDate);
      } else {
        q = q.eq('scheduled_date', fromDate);
      }

      const { data, error } = await q;
      if (error) throw error;
      const visits = (data.map(mapVisit)) as CRMJobVisit[];
      // Filter out snow jobs. For cancelled/completed parent jobs, only hide the
      // visit if the visit itself is still pending (scheduled/dispatched) — completed
      // and skipped visits should always remain visible so they appear in the board's
      // Completed / Skipped filter tabs.
      const terminalVisitStatuses = new Set(['completed', 'skipped', 'cancelled']);
      return visits.filter((v) => {
        if (v.job?.jobType === 'snow') return false;
        const parentDone = v.job?.status === 'cancelled' || v.job?.status === 'completed';
        if (parentDone && !terminalVisitStatuses.has(v.status)) return false;
        return true;
      });
    },
    enabled: !!fromDate,
  });
}

export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      jobId: string;
      clientId: string;
      scheduledDate: string;
      crewId?: string | null;
      startTime?: string | null;
      endTime?: string | null;
      priority?: number;
      notesToCrew?: string | null;
      invoiceDescription?: string | null;
      stormEventId?: string | null;
      orderNum?: number | null;
      jobServiceId?: string | null;
      /** Current job_type of the parent job, e.g. from a Waiting List dispatch —
       * used to graduate a waiting_list job into a concretely scheduled one below. */
      jobType?: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_job_visits')
        .insert({
          job_id: values.jobId,
          client_id: values.clientId,
          scheduled_date: values.scheduledDate,
          crew_id: values.crewId ?? null,
          start_time: values.startTime ?? null,
          end_time: values.endTime ?? null,
          priority: values.priority ?? 1,
          notes_to_crew: values.notesToCrew ?? null,
          invoice_description: values.invoiceDescription ?? null,
          storm_event_id: values.stormEventId ?? null,
          order_num: values.orderNum ?? null,
          job_service_id: values.jobServiceId ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // Cascade crew assignment to parent job so it shows everywhere
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobUpdate: Record<string, any> = {};
      if (values.crewId !== undefined) jobUpdate.crew_id = values.crewId ?? null;

      // Dispatching a Waiting List job's first visit only ever created the visit
      // row — the parent job stayed job_type='waiting_list' with scheduled_date
      // null forever, so every OTHER view that reads job-level fields (job side
      // panel top bar, client profile upcoming/history icons, jobs list date
      // column) kept showing it as an unscheduled waiting-list entry even
      // though the dispatch board correctly showed the visit as dispatched.
      // Stamp scheduled_date so those views pick up the date, but keep
      // job_type='waiting_list' — it's the job's category, not its schedule
      // state, and a job can have multiple line-item visits dispatched
      // independently of one another (some out, some still pending), so
      // there's no single "now it's one_time" moment to flip it at.
      if (values.jobType === 'waiting_list') {
        jobUpdate.scheduled_date = values.scheduledDate;
      }

      if (Object.keys(jobUpdate).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('crm_jobs').update(jobUpdate).eq('id', values.jobId);
      }

      return mapVisit(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-job-visits'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
    },
  });
}

export function useDeleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (visitId: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('crm_job_visits')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', visitId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-job-visits'] }),
  });
}

export function useDeleteVisitsByDayOfWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, dayOfWeek }: { jobId: string; dayOfWeek: number }) => {
      // dayOfWeek: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_job_visits')
        .select('id, scheduled_date')
        .eq('job_id', jobId)
        .is('deleted_at', null)
        .eq('status', 'scheduled');
      if (error) throw error;
      const ids = (data as { id: string; scheduled_date: string }[])
        .filter((r) => new Date(r.scheduled_date + 'T00:00:00').getDay() === dayOfWeek)
        .map((r) => r.id);
      if (ids.length === 0) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase as any)
        .from('crm_job_visits')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', ids);
      if (delErr) throw delErr;
      return ids.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-job-visits'] }),
  });
}

export function useUpdateVisitStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      jobId,
      jobType,
    }: {
      id: string;
      status: VisitStatus;
      jobId?: string;
      jobType?: string;
    }) => {
      const supabase = createClient();
      if (status === 'completed') {
        // Use server route so both visit + job update atomically with no RLS ambiguity
        const res = await fetch(`/api/crm/visits/${id}/complete`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          throw new Error(body.error ?? 'Failed to complete visit');
        }
        const body = await res.json() as { clientId?: string };
        return body;
      }

      const patch: Record<string, unknown> = { status };
      if (status === 'dispatched') patch.dispatched_at = new Date().toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_job_visits').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crm-job-visits'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
      const clientId = (data as { clientId?: string } | undefined)?.clientId;
      if (clientId) {
        qc.invalidateQueries({ queryKey: ['clients', clientId, 'activity'] });
        qc.invalidateQueries({ queryKey: ['clients', clientId] });
        qc.invalidateQueries({ queryKey: ['crm-invoices'] });
      }
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
  });
}

export function useUpdateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
      jobId,
      jobType,
    }: {
      id: string;
      updates: Partial<{
        status: VisitStatus;
        sub_status: string | null;
        scheduled_date: string;
        crew_id: string | null;
        start_time: string | null;
        end_time: string | null;
        actual_hours: number | null;
        budgeted_hours: number | null;
        men_count: number;
        qty: number | null;
        rate_cents: number | null;
        notes_to_crew: string | null;
        notes_to_client: string | null;
        completion_notes: string | null;
        invoice_description: string | null;
        job_comments: unknown;
        priority: number;
        assigned_employee_id: string | null;
        dispatched_at: string | null;
        completed_at: string | null;
        order_num: number | null;
        snow_depth_inches: number | null;
        temperature: number | null;
        asset_type: string | null;
        materials_used: { name: string; qty: number; rate_cents: number }[];
      }>;
      jobId?: string;
      jobType?: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('crm_job_visits')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;

      // Cascade completion to parent job via server route
      if (updates.status === 'completed' && id) {
        const res = await fetch(`/api/crm/visits/${id}/complete`, { method: 'POST' });
        if (!res.ok) {
          const body = await res.json() as { error?: string };
          throw new Error(body.error ?? 'Failed to complete job');
        }
      }

      // Cascade crew assignment to parent job so it shows everywhere
      if ('crew_id' in updates && jobId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('crm_jobs').update({ crew_id: updates.crew_id }).eq('id', jobId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-job-visits'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
    },
  });
}

export function useGenerateVisits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      job,
      dates,
    }: {
      job: { id: string; clientId: string; crewId?: string | null; notesToCrew?: string | null };
      dates: string[];
    }) => {
      const supabase = createClient();
      const rows = dates.map((d, i) => ({
        job_id: job.id,
        client_id: job.clientId,
        crew_id: job.crewId ?? null,
        scheduled_date: d,
        priority: i + 1,
        notes_to_crew: job.notesToCrew ?? null,
      }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_job_visits').insert(rows);
      if (error) throw error;
      return dates.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-job-visits'] }),
  });
}

export function useCreateClientJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: NewClientJobFormValues) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_jobs')
        .insert({
          created_by: user?.id ?? null,
          client_id: values.clientId,
          job_type: values.jobType,
          status: values.isComplete ? 'completed' : 'scheduled',
          contract_id: values.contractId || null,
          crew_id: values.crewId || null,
          schedule: values.schedule || null,
          schedule_days: values.scheduleDays,
          package_id: values.packageId || null,
          package_name: values.packageName || null,
          package_renewal: values.packageRenewal || null,
          package_discount: values.packageDiscount || null,
          conflict_days: values.conflictDays,
          inch_trigger: values.inchTrigger ?? null,
          invoice_type: values.invoiceType || null,
          rate_per_inch_cents: values.ratePerInchCents ?? null,
          asset_type: values.assetType || null,
          sales_rep_id: values.salesRepId || null,
          source: values.source || null,
          payment_type: values.paymentType || null,
          po_number: values.poNumber || null,
          date_sold: values.dateSold || null,
          when_to_invoice: values.whenToInvoice || null,
          invoice_separately: values.invoiceSeparately,
          call_ahead: values.callAhead,
          arrival_window_hours: values.arrivalWindowHours ?? null,
          scheduled_date: values.scheduledDate || null,
          waiting_list_start: values.waitingListStart || null,
          waiting_list_end: values.waitingListEnd || null,
          start_date_window: values.startDateWindow || null,
          end_date_window: values.endDateWindow || null,
          is_complete: values.isComplete,
          notes: values.notes || null,
          notes_to_crew: values.notesToCrew || null,
          budgeted_hours: values.services.reduce((sum, s) => sum + (s.budgetedHours || 0) * (s.teamSize || 1), 0) || null,
        })
        .select()
        .single();
      if (error) throw error;

      // sort_order -> inserted crm_job_services.id, used below to link each
      // package visit to the specific service/visit it was generated from.
      let serviceIdBySortOrder: Record<number, string> = {};
      if (values.services.length > 0) {
        const jobId = (data as { id: string }).id;
        const serviceRows = values.services.map((s, i) => ({
          job_id: jobId,
          service_id: s.serviceId || null,
          service_name: s.serviceName || '',
          start_date: s.startDate || null,
          complete_by_date: s.completeByDate || null,
          start_recurring: s.startRecurring || null,
          assigned_to: s.assignedTo || null,
          qty: s.qty,
          rate_cents: s.rateCents,
          budgeted_hours: s.budgetedHours,
          budget_method: s.budgetMethod,
          team_size: s.teamSize,
          days_count: s.daysCount,
          time_start: s.timeStart || null,
          time_end: s.timeEnd || null,
          included: s.included,
          sort_order: i,
        }));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insertedServices, error: svcErr } = await (supabase as any)
          .from('crm_job_services')
          .insert(serviceRows)
          .select('id, sort_order');
        if (svcErr) throw svcErr;
        serviceIdBySortOrder = ((insertedServices ?? []) as { id: string; sort_order: number }[])
          .reduce<Record<number, string>>((acc, row) => { acc[row.sort_order] = row.id; return acc; }, {});
      }

      const job = data as { id: string };

      // Auto-create the first visit for jobs with a fixed scheduled date
      // Recurring jobs get their first visit here; Generate Visits handles future ones
      const autoVisitTypes = ['one_time', 'snow', 'project', 'recurring'];
      if (values.scheduledDate && autoVisitTypes.includes(values.jobType)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('crm_job_visits').insert({
          job_id: job.id,
          client_id: values.clientId,
          scheduled_date: values.scheduledDate,
          status: values.isComplete ? 'completed' : 'scheduled',
          crew_id: values.crewId || null,
          completed_at: values.isComplete ? new Date().toISOString() : null,
        });
      }

      // Package jobs don't have a single scheduledDate — each service row
      // already carries its own resolved date from the package's visit
      // schedule (see NewJobDialog.pickPackage). Create one visit per dated row.
      if (values.jobType === 'package') {
        const visitRows = values.services
          .map((s, i) => ({ s, i }))
          .filter(({ s }) => s.startDate)
          .map(({ s, i }) => ({
            job_id: job.id,
            client_id: values.clientId,
            job_service_id: serviceIdBySortOrder[i] ?? null,
            scheduled_date: s.startDate,
            status: 'scheduled',
            crew_id: values.crewId || null,
          }));
        if (visitRows.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('crm_job_visits').insert(visitRows);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('client_activity').insert({
        client_id: values.clientId,
        activity_type: 'job',
        subject: `Job created: ${values.jobType.replace(/_/g, ' ')}`,
        ref_id: job.id,
        ref_table: 'crm_jobs',
      });

      return data;
    },
    onSuccess: (_data, values) => {
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs', 'client', values.clientId] });
      qc.invalidateQueries({ queryKey: ['clients', values.clientId, 'activity'] });
    },
  });
}

export function useCompleteClientJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('crm_jobs')
        .update({ status: 'completed', is_complete: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
    },
  });
}

// ── all services (including inactive) ────────────────────────────────────────

export function useAllCRMServices() {
  return useQuery({
    queryKey: ["crm-services", "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_services")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data.map(mapService)) as CRMService[];
    },
  });
}

// ── create service ────────────────────────────────────────────────────────────

export function useCreateCRMService() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (values: Record<string, any>) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_services")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return mapService(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-services"] });
    },
  });
}

// ── bulk import services ──────────────────────────────────────────────────────

export function useBulkImportCRMServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any).from("crm_services").select("id, code").is("deleted_at", null);
      const byCode = new Map((existing ?? []).filter((s: { code: string | null }) => s.code).map((s: { code: string; id: string }) => [s.code.trim().toLowerCase(), s.id]));

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const r of rows) {
        const name = r.name?.trim();
        if (!name) { skipped++; continue; }

        const code = r.code?.trim() || null;
        const payload = {
          name,
          code,
          category: r.category?.trim() || "general",
          unit: (["visit", "sqft", "lf", "cuyd", "acres", "hr", "each", "lb", "gal"].includes(r.unit?.trim().toLowerCase()) ? r.unit.trim().toLowerCase() : "visit"),
          default_rate_cents: r.defaultRate ? Math.round(parseFloat(r.defaultRate) * 100) : null,
          production_rate_sqft_per_hr: r.productionRate ? parseFloat(r.productionRate) : null,
          is_active: r.isActive?.trim().toLowerCase() !== "no",
        };

        const existingId = code ? byCode.get(code.toLowerCase()) : undefined;
        if (existingId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("crm_services").update(payload).eq("id", existingId);
          if (error) throw error;
          updated++;
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from("crm_services").insert(payload);
          if (error) throw error;
          created++;
        }
      }

      return { created, updated, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-services"] });
    },
  });
}

// ── update service ────────────────────────────────────────────────────────────

export function useUpdateCRMService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patch: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_services")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-services"] });
    },
  });
}

// ── soft-delete service ───────────────────────────────────────────────────────

export function useDeleteCRMService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_services")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-services"] });
    },
  });
}

// ── rate matrix ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRateMatrixRow(row: any): CRMServiceRateMatrixRow {
  return {
    id: row.id,
    orgId: row.org_id,
    serviceId: row.service_id,
    fromQty: Number(row.from_qty),
    toQty: Number(row.to_qty),
    rateCents: row.rate_cents,
    budgetedHours: Number(row.budgeted_hours),
    budgetedCostCents: row.budgeted_cost_cents,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useServiceRateMatrix(serviceId: string) {
  return useQuery({
    queryKey: ["crm-service-rate-matrix", serviceId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_service_rate_matrix")
        .select("*")
        .eq("service_id", serviceId)
        .order("sort_order");
      if (error) throw error;
      return (data.map(mapRateMatrixRow)) as CRMServiceRateMatrixRow[];
    },
    enabled: !!serviceId,
  });
}

export function useUpsertRateMatrixRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serviceId,
      row,
    }: {
      serviceId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_service_rate_matrix")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ service_id: serviceId, ...row } as any);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-service-rate-matrix", vars.serviceId] });
    },
  });
}

export function useDeleteRateMatrixRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, serviceId }: { id: string; serviceId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_service_rate_matrix")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { serviceId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-service-rate-matrix", vars.serviceId] });
    },
  });
}

// ── jobs list (all jobs, filterable) ─────────────────────────────────────────

export function useJobsList(filters?: {
  status?: string;
  jobType?: string;
  fromDate?: string;
  toDate?: string;
  clientId?: string;
  activeOnly?: boolean;
}) {
  return useQuery({
    queryKey: ["crm-jobs", "list", filters],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_jobs")
        .select(`
          *,
          clients(display_name, primary_phone),
          crm_crews(name),
          crm_job_services(*),
          crm_job_visits(id, scheduled_date, status, deleted_at, job_service_id, crm_crews(name))
        `)
        .is("deleted_at", null)
        .neq("job_type", "snow")
        .order("scheduled_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (filters?.status)     q = q.eq("status", filters.status);
      if (filters?.activeOnly) q = q.neq("status", "completed").neq("status", "cancelled");
      if (filters?.jobType)    q = q.eq("job_type", filters.jobType);
      if (filters?.clientId) q = q.eq("client_id", filters.clientId);
      // Date-range filtering happens client-side in JobsList against each job's
      // actual visit occurrences (see mapJob's `visits`) — the job-level
      // scheduled_date is only meaningful for one-time/snow/project jobs and
      // goes stale for recurring/package/waiting_list jobs once visits are
      // generated, so filtering on it here would hide/misplace those jobs.

      const { data, error } = await q;
      if (error) throw error;
      return (data.map(mapJob)) as CRMJob[];
    },
  });
}

// ── create jobs from won estimate ─────────────────────────────────────────────

export function useCreateJobsFromEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      estimateId,
      clientId,
      jobType,
      scheduledDate,
      crewId,
      notesToCrew,
      services,
    }: {
      estimateId: string;
      clientId: string;
      jobType: string;
      scheduledDate: string | null;
      crewId: string | null;
      notesToCrew: string | null;
      services: { serviceName: string; serviceId: string | null; qty: number; rateCents: number | null; totalCents: number }[];
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_jobs")
        .insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          job_type: jobType,
          status: scheduledDate ? "scheduled" : "hold",
          scheduled_date: scheduledDate,
          crew_id: crewId,
          notes_to_crew: notesToCrew,
          source: "estimate",
          rate_cents: services.reduce((s, sv) => s + sv.totalCents, 0),
          schedule_days: [],
          conflict_days: [],
          man_count: 1,
          call_ahead: false,
          is_complete: false,
          invoice_separately: false,
        })
        .select()
        .single();
      if (error) throw error;

      const jobId = (data as { id: string }).id;

      if (services.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: svcError } = await (supabase as any)
          .from("crm_job_services")
          .insert(
            services.map((s, i) => ({
              job_id: jobId,
              service_id: s.serviceId,
              service_name: s.serviceName,
              qty: s.qty,
              rate_cents: s.rateCents,
              sort_order: i,
              included: true,
              budgeted_hours: 0,
              team_size: 1,
              days_count: 1,
            }))
          );
        if (svcError) throw svcError;
      }

      // Mark estimate accepted
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("estimates")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ stage: "accepted" } as any)
        .eq("id", estimateId);

      return { jobId };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}

// ── single job detail ─────────────────────────────────────────────────────────

export function useJobDetail(id: string) {
  return useQuery({
    queryKey: ['crm-jobs', 'detail', id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_jobs')
        .select(`
          *,
          clients(display_name, billing_address, billing_city, billing_state, billing_zip, primary_phone, client_since),
          crm_crews(name),
          crm_job_services(*)
        `)
        .eq('id', id)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return mapJobFull(data);
    },
    enabled: !!id,
  });
}

export function useJobVisits(jobId: string) {
  return useQuery({
    queryKey: ['crm-job-visits', 'job', jobId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_job_visits')
        .select('*, crm_crews(name), crm_jobs(budgeted_hours, rate_cents, crm_job_services(rate_cents, budgeted_hours, qty, service_name, service_id))')
        .eq('job_id', jobId)
        .is('deleted_at', null)
        .order('scheduled_date', { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map((row: any) => applyJobServiceFallback(mapVisit(row), row))) as CRMJobVisit[];
    },
    enabled: !!jobId,
  });
}

export function useClientAllVisits(clientId: string) {
  return useQuery({
    queryKey: ['crm-job-visits', 'client', clientId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_job_visits')
        .select('*, crm_crews(name), crm_jobs(budgeted_hours, rate_cents, crm_job_services(rate_cents, budgeted_hours, qty, service_name, service_id))')
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .order('scheduled_date', { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map((row: any) => applyJobServiceFallback(mapVisit(row), row))) as CRMJobVisit[];
    },
    enabled: !!clientId,
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_jobs').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['crm-jobs', 'detail', vars.id] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
    },
  });
}

// ── schedules ─────────────────────────────────────────────────────────────────

import type { CRMSchedule } from '@/types/crm-jobs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSchedule(row: any): CRMSchedule {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    frequency: row.frequency,
    dayOfWeek: row.day_of_week,
    weekPattern: row.week_pattern ?? null,
    anchorDate: row.anchor_date ?? null,
    seasonStart: row.season_start ?? null,
    seasonEnd: row.season_end ?? null,
    weekOfMonth: row.week_of_month ?? null,
    isActive: row.is_active,
  };
}

export function useCRMSchedules() {
  return useQuery({
    queryKey: ['crm-schedules'],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_schedules')
        .select('*')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data.map(mapSchedule)) as CRMSchedule[];
    },
  });
}

export function useAllCRMSchedules() {
  return useQuery({
    queryKey: ['crm-schedules', 'all'],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_schedules')
        .select('*')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data.map(mapSchedule)) as CRMSchedule[];
    },
  });
}

export function useCreateCRMSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      frequency: CRMSchedule['frequency'];
      dayOfWeek: CRMSchedule['dayOfWeek'];
      weekPattern: CRMSchedule['weekPattern'];
      anchorDate: string | null;
      seasonStart: string | null;
      seasonEnd: string | null;
      weekOfMonth?: CRMSchedule['weekOfMonth'];
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_schedules')
        .insert({
          name: values.name,
          frequency: values.frequency,
          day_of_week: values.dayOfWeek,
          week_pattern: values.weekPattern ?? null,
          anchor_date: values.anchorDate ?? null,
          season_start: values.seasonStart ?? null,
          season_end: values.seasonEnd ?? null,
          week_of_month: values.weekOfMonth ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapSchedule(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-schedules'] });
    },
  });
}

const SCHEDULE_FREQUENCIES = ['weekly', 'bi_weekly', 'every_3_weeks', 'every_4_weeks', 'monthly'];
const SCHEDULE_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function useBulkImportCRMSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();

      let created = 0;
      let skipped = 0;

      for (const r of rows) {
        const name = r.name?.trim();
        const frequency = r.frequency?.trim().toLowerCase();
        const dayOfWeek = SCHEDULE_DAYS.find((d) => d.toLowerCase() === r.dayOfWeek?.trim().toLowerCase());
        if (!name || !SCHEDULE_FREQUENCIES.includes(frequency) || !dayOfWeek) { skipped++; continue; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('crm_schedules').insert({
          name,
          frequency,
          day_of_week: dayOfWeek,
          week_pattern: ['even', 'odd', 'any'].includes(r.weekPattern?.trim().toLowerCase()) ? r.weekPattern.trim().toLowerCase() : null,
          anchor_date: r.anchorDate?.trim() || null,
          season_start: r.seasonStart?.trim() || null,
          season_end: r.seasonEnd?.trim() || null,
          week_of_month: ['first', 'second', 'third', 'fourth', 'last'].includes(r.weekOfMonth?.trim().toLowerCase()) ? r.weekOfMonth.trim().toLowerCase() : null,
        });
        if (error) throw error;
        created++;
      }

      return { created, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-schedules'] });
    },
  });
}

export function useUpdateCRMSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        frequency?: CRMSchedule['frequency'];
        dayOfWeek?: CRMSchedule['dayOfWeek'];
        weekPattern?: CRMSchedule['weekPattern'];
        anchorDate?: string | null;
        seasonStart?: string | null;
        seasonEnd?: string | null;
        weekOfMonth?: CRMSchedule['weekOfMonth'];
        isActive?: boolean;
      };
    }) => {
      const supabase = createClient();
      const dbPatch: Record<string, unknown> = {};
      if (patch.name !== undefined)        dbPatch.name = patch.name;
      if (patch.frequency !== undefined)   dbPatch.frequency = patch.frequency;
      if (patch.dayOfWeek !== undefined)   dbPatch.day_of_week = patch.dayOfWeek;
      if (patch.weekPattern !== undefined) dbPatch.week_pattern = patch.weekPattern;
      if (patch.anchorDate !== undefined)  dbPatch.anchor_date = patch.anchorDate;
      if (patch.seasonStart !== undefined) dbPatch.season_start = patch.seasonStart;
      if (patch.seasonEnd !== undefined)   dbPatch.season_end = patch.seasonEnd;
      if (patch.weekOfMonth !== undefined) dbPatch.week_of_month = patch.weekOfMonth;
      if (patch.isActive !== undefined)    dbPatch.is_active = patch.isActive;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('crm_schedules')
        .update(dbPatch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-schedules'] });
    },
  });
}

export function useDeleteCRMSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('crm_schedules')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-schedules'] });
    },
  });
}

export function useUpdateJobService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: {
      id: string;
      patch: { qty?: number; rate_cents?: number | null };
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('crm_job_services')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-job-detail'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
    },
  });
}

export function useAddJobService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, serviceId, serviceName, qty, rateCents, budgetedHours, budgetMethod, startDate, completeByDate }: {
      jobId: string;
      serviceId?: string | null;
      serviceName: string;
      qty: number;
      rateCents: number | null;
      budgetedHours: number;
      budgetMethod?: BudgetMethod;
      startDate?: string | null;
      completeByDate?: string | null;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('crm_job_services').insert({
        job_id: jobId,
        service_id: serviceId || null,
        service_name: serviceName,
        qty,
        rate_cents: rateCents,
        budgeted_hours: budgetedHours,
        budget_method: budgetMethod ?? 'manual',
        team_size: 1,
        days_count: 1,
        included: true,
        start_date: startDate || null,
        complete_by_date: completeByDate || null,
      }).select().single();
      if (error) throw error;

      // A package service with a start date needs its first visit right away —
      // otherwise it silently sits unscheduled until someone remembers to click
      // "Generate Visits" (see the reconciliation route for why this can't just
      // happen at insert time: it also has to dedupe against pre-existing visits).
      if (startDate) {
        await fetch('/api/crm/jobs/generate-visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId }),
        }).catch(() => {});
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-job-detail'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
      qc.invalidateQueries({ queryKey: ['crm-job-visits'] });
    },
  });
}

export function useDeleteJobService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_job_services').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-job-detail'] });
      qc.invalidateQueries({ queryKey: ['crm-jobs'] });
    },
  });
}

// ── CRM Job Products ──────────────────────────────────────────────────────────

export interface CRMJobProduct {
  id: string;
  jobId: string;
  productId: string | null;
  productName: string;
  qty: number;
  unitPriceCents: number;
  unitCostCents: number | null;
  notes: string | null;
}

function mapJobProduct(row: Record<string, unknown>): CRMJobProduct {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    productId: row.product_id as string | null,
    productName: row.product_name as string,
    qty: Number(row.qty),
    unitPriceCents: Number(row.unit_price_cents),
    unitCostCents: row.unit_cost_cents != null ? Number(row.unit_cost_cents) : null,
    notes: row.notes as string | null,
  };
}

export function useCRMJobProducts(jobId: string) {
  return useQuery({
    queryKey: ['crm-job-products', jobId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('crm_job_products')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at');
      if (error) throw error;
      return (data as Record<string, unknown>[]).map(mapJobProduct);
    },
    enabled: !!jobId,
  });
}

export function useAddCRMJobProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      jobId: string;
      productId: string | null;
      productName: string;
      qty: number;
      unitPriceCents: number;
      unitCostCents: number | null;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_job_products').insert({
        job_id: p.jobId,
        product_id: p.productId,
        product_name: p.productName,
        qty: p.qty,
        unit_price_cents: p.unitPriceCents,
        unit_cost_cents: p.unitCostCents,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['crm-job-products', v.jobId] });
      qc.invalidateQueries({ queryKey: ['crm-job-detail'] });
    },
  });
}

export function useUpdateCRMJobProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: string;
      jobId: string;
      qty?: number;
      unitPriceCents?: number;
      notes?: string | null;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_job_products').update({
        ...(p.qty !== undefined && { qty: p.qty }),
        ...(p.unitPriceCents !== undefined && { unit_price_cents: p.unitPriceCents }),
        ...(p.notes !== undefined && { notes: p.notes }),
      }).eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['crm-job-products', v.jobId] });
      qc.invalidateQueries({ queryKey: ['crm-job-detail'] });
    },
  });
}

export function useDeleteCRMJobProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; jobId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('crm_job_products').delete().eq('id', p.id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['crm-job-products', v.jobId] });
      qc.invalidateQueries({ queryKey: ['crm-job-detail'] });
    },
  });
}

// ── client service history (for audience/segment filtering) ───────────────────
// "Has client X ever had a scheduled/completed visit for service Y" — used by
// the Sales Campaigns filter and reusable anywhere else that needs it. Two
// flat queries + a client-side join, rather than one query with two
// ambiguous relationships to crm_job_services (visit.job_service_id vs the
// job's own services), which PostgREST can't disambiguate cleanly.
const TERMINAL_VISIT_STATUSES_HISTORY = new Set(["completed", "cancelled", "skipped"]);

export function useClientServiceHistory() {
  return useQuery({
    queryKey: ["crm-jobs", "client-service-history"],
    queryFn: async () => {
      const supabase = createClient();
      const [visitsRes, servicesRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("crm_job_visits").select("job_id, client_id, status, job_service_id").is("deleted_at", null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("crm_job_services").select("id, job_id, service_name").is("deleted_at", null),
      ]);
      if (visitsRes.error) throw visitsRes.error;
      if (servicesRes.error) throw servicesRes.error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const services = servicesRes.data as { id: string; job_id: string; service_name: string }[];
      const nameById = new Map(services.map((s) => [s.id, s.service_name]));
      const namesByJobId = new Map<string, string[]>();
      services.forEach((s) => {
        namesByJobId.set(s.job_id, [...(namesByJobId.get(s.job_id) ?? []), s.service_name]);
      });

      const scheduled = new Map<string, Set<string>>();
      const completed = new Map<string, Set<string>>();
      const add = (map: Map<string, Set<string>>, name: string, clientId: string) => {
        if (!map.has(name)) map.set(name, new Set());
        map.get(name)!.add(clientId);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (visitsRes.data as { job_id: string; client_id: string; status: string; job_service_id: string | null }[]).forEach((v) => {
        const names = v.job_service_id && nameById.has(v.job_service_id)
          ? [nameById.get(v.job_service_id)!]
          : namesByJobId.get(v.job_id) ?? [];
        const target = v.status === "completed" ? completed
          : TERMINAL_VISIT_STATUSES_HISTORY.has(v.status) ? null
          : scheduled;
        if (!target) return;
        names.forEach((n) => add(target, n, v.client_id));
      });

      return { scheduled, completed };
    },
  });
}
