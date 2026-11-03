import type { BudgetMethod, NewClientJobFormValues, NewClientJobServiceValues } from "@/types/crm-jobs";

/**
 * Package renewal ("Renew for next season") — the pure part.
 *
 * A renewal copies last season's package job (client, property, services,
 * rates, crew, budgets, Min Days) into a new package job and moves every step
 * date forward by whole years. It deliberately keeps the job's own dates
 * rather than re-reading the package template: per-client adjustments made on
 * last season's job (a moved step, a changed rate) carry over, and a template
 * edit only reaches new sign-ups. Min Days spacing is re-applied afterwards. The new job goes through the same
 * useCreateClientJob path as Add Job, so its visits are created the same way.
 */

/** crm_jobs.package_renewal value for "client is not renewing". NULL = renew as usual. */
export const DO_NOT_RENEW = "do_not_renew";

/** The fields of a crm_jobs row (+ embedded services) a renewal reads. */
export interface RenewalSourceJob {
  id: string;
  client_id: string;
  property_id: string | null;
  job_type: string;
  contract_id: string | null;
  crew_id: string | null;
  schedule: string | null;
  schedule_days: string[] | null;
  package_id: string | null;
  package_name: string | null;
  package_discount: string | null;
  package_total_steps: number | null;
  conflict_days: string[] | null;
  invoice_type: string | null;
  sales_rep_id: string | null;
  source: string | null;
  payment_type: string | null;
  when_to_invoice: string | null;
  invoice_separately: boolean | null;
  call_ahead: boolean | null;
  arrival_window_hours: number | null;
  waiting_list_start: string | null;
  waiting_list_end: string | null;
  notes: string | null;
  notes_to_crew: string | null;
  invoice_description: string | null;
  crm_job_services: RenewalSourceService[] | null;
}

export interface RenewalSourceService {
  id: string;
  service_id: string | null;
  service_name: string;
  start_date: string | null;
  complete_by_date: string | null;
  assigned_to: string | null;
  qty: number | null;
  rate_cents: number | null;
  budgeted_hours: number | null;
  budget_method: string | null;
  team_size: number | null;
  days_count: number | null;
  time_start: string | null;
  time_end: string | null;
  included: boolean | null;
  sort_order: number;
  min_days: number | null;
  is_taxable: boolean | null;
  max_visits: number | null;
  treated_area: number | null;
}

export interface RenewalSourceProduct {
  product_id: string | null;
  product_name: string;
  qty: number;
  planned_qty: number | null;
  unit_price_cents: number;
  unit_cost_cents: number | null;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** "YYYY-MM-DD" moved by whole years; Feb 29 lands on Feb 28 in a non-leap year. */
export function shiftYmdYears(ymd: string, years: number): string {
  const y = parseInt(ymd.slice(0, 4), 10) + years;
  let rest = ymd.slice(4);
  if (rest === "-02-29" && !isLeap(y)) rest = "-02-28";
  return `${String(y).padStart(4, "0")}${rest}`;
}

function shiftOrNull(ymd: string | null, years: number): string | null {
  return ymd ? shiftYmdYears(ymd, years) : null;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Re-applies Min Days spacing to the shifted step dates, in step order — the
 * same rule computePackageVisitSchedule uses when a package is picked on Add
 * Job: a step lands on the later of its own date and (previous step + its Min
 * Days). A job whose step rows all carry the window start (estimate convert,
 * older jobs) would otherwise renew with every visit on the same day.
 */
function applyMinDaysSpacing(services: NewClientJobServiceValues[]): NewClientJobServiceValues[] {
  let prev: string | null = null;
  return services.map((s) => {
    if (!s.startDate) return s;
    let date = s.startDate;
    if (prev && s.minDays) {
      const earliest = addDaysYmd(prev, s.minDays);
      if (earliest > date) date = earliest;
    }
    prev = date;
    return date === s.startDate ? s : { ...s, startDate: date };
  });
}

/** First / last date the program covers: the job's window, else its step dates. */
export function packageProgramSpan(job: {
  waiting_list_start: string | null;
  waiting_list_end: string | null;
  crm_job_services: { start_date: string | null; complete_by_date: string | null }[] | null;
}): { start: string | null; end: string | null } {
  const dates = (job.crm_job_services ?? [])
    .flatMap((s) => [s.start_date, s.complete_by_date])
    .filter((d): d is string => !!d)
    .sort();
  return {
    start: job.waiting_list_start ?? dates[0] ?? null,
    end: job.waiting_list_end ?? dates[dates.length - 1] ?? job.waiting_list_start ?? null,
  };
}

/** The season (calendar year the program starts in), or null for an undated job. */
export function packageSeasonYear(job: Parameters<typeof packageProgramSpan>[0]): number | null {
  const { start } = packageProgramSpan(job);
  return start ? parseInt(start.slice(0, 4), 10) : null;
}

/**
 * How many years forward the renewal goes: one, unless the job is from a
 * season that's long gone — then far enough that the renewed program hasn't
 * already ended (renewing a client who skipped a year lands on the coming
 * season, not on one that's over).
 */
export function renewalYearsAhead(programEnd: string | null, today: string): number {
  if (!programEnd) return 1;
  let years = 1;
  while (years < 50 && shiftYmdYears(programEnd, years) < today) years++;
  return years;
}

export interface BuildRenewalOptions {
  years: number;
  /** Org-local "today", stamped as Date Sold. */
  today: string;
  /** Last season's contract still covers the renewed season. */
  keepContract: boolean;
}

/** The Add Job form values for the renewed job. */
export function buildRenewalValues(
  job: RenewalSourceJob,
  products: RenewalSourceProduct[],
  { years, today, keepContract }: BuildRenewalOptions,
): NewClientJobFormValues {
  const services = [...(job.crm_job_services ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  return {
    clientId: job.client_id,
    propertyId: job.property_id,
    jobType: "package",
    projectId: null,
    contractId: keepContract ? job.contract_id : null,
    crewId: job.crew_id,
    schedule: job.schedule,
    scheduleDays: job.schedule_days ?? [],
    packageId: job.package_id,
    packageName: job.package_name,
    packageRenewal: null,
    packageDiscount: job.package_discount,
    packageTotalSteps: job.package_total_steps,
    conflictDays: job.conflict_days ?? [],
    inchTrigger: null,
    invoiceType: job.invoice_type,
    ratePerInchCents: null,
    assetType: null,
    salesRepId: job.sales_rep_id,
    saleType: "renewal",
    source: job.source,
    paymentType: job.payment_type,
    poNumber: null,
    dateSold: today,
    whenToInvoice: job.when_to_invoice,
    invoiceSeparately: job.invoice_separately ?? false,
    callAhead: job.call_ahead ?? false,
    arrivalWindowHours: job.arrival_window_hours,
    scheduledDate: null,
    waitingListStart: shiftOrNull(job.waiting_list_start, years),
    waitingListEnd: shiftOrNull(job.waiting_list_end, years),
    startDateWindow: null,
    endDateWindow: null,
    recurrenceEnd: null,
    isComplete: false,
    notes: job.notes,
    invoiceDescription: job.invoice_description,
    notesToCrew: job.notes_to_crew,
    renewedFromJobId: job.id,
    services: applyMinDaysSpacing(services.map((s, idx): NewClientJobServiceValues => ({
      serviceId: s.service_id,
      serviceName: s.service_name,
      startDate: shiftOrNull(s.start_date, years),
      completeByDate: shiftOrNull(s.complete_by_date, years),
      startRecurring: null,
      assignedTo: s.assigned_to,
      qty: s.qty ?? 1,
      rateCents: s.rate_cents ?? 0,
      budgetedHours: s.budgeted_hours ?? 0,
      budgetMethod: (s.budget_method ?? "manual") as BudgetMethod,
      teamSize: s.team_size ?? 1,
      daysCount: s.days_count ?? 1,
      timeStart: s.time_start,
      timeEnd: s.time_end,
      included: s.included ?? true,
      sortOrder: idx,
      minDays: s.min_days,
      isTaxable: s.is_taxable,
      maxVisits: s.max_visits,
      treatedArea: s.treated_area,
    }))),
    products: products.map((p) => ({
      productId: p.product_id,
      productName: p.product_name,
      qty: p.planned_qty ?? p.qty,
      unitPriceCents: p.unit_price_cents,
      unitCostCents: p.unit_cost_cents,
    })),
  };
}
