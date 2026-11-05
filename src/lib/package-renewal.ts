import type { BudgetMethod, NewClientJobFormValues, NewClientJobServiceValues } from "@/types/crm-jobs";
import type { CRMPackageService } from "@/types/crm-packages";
import { computePackageVisitSchedule, expandPackageStepVisits } from "@/lib/package-schedule";
import { adjustCents, type RoundingRule } from "@/lib/pricing/adjust";

/**
 * Package renewal ("Renew for next season") — the pure part.
 *
 * A renewal copies last season's package job (client, property, services,
 * rates, crew, budgets, Min Days) into a new package job and moves every step
 * date forward by whole years. It deliberately keeps the job's own dates
 * by default rather than re-reading the package template: per-client
 * adjustments made on last season's job (a moved step, a changed rate) carry
 * over, and a template edit only reaches new sign-ups. "Use the package's
 * current dates" (templateDates) takes each step's window from the template
 * instead — still the job's own steps and rates. Min Days spacing is
 * re-applied afterwards either way. The new job goes through the same
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

/** The day halfway between two "YYYY-MM-DD" dates (rounded down). */
function midpointYmd(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  return addDaysYmd(start, Math.floor((e - s) / 86_400_000 / 2));
}

/**
 * How many years forward the renewal goes: the first season that hasn't
 * started yet, or one already under way while most of it is still ahead
 * (a late sign-up renews into the current season). A season that is past its
 * midpoint, or over, is skipped — renewing a client who skipped a year in
 * November lands on next spring, not on a program that's nearly done.
 */
export function renewalYearsAhead(span: { start: string | null; end: string | null }, today: string): number {
  const start = span.start ?? span.end;
  const end = span.end ?? span.start;
  if (!start || !end) return 1;
  for (let years = 1; years < 50; years++) {
    const s = shiftYmdYears(start, years);
    const e = shiftYmdYears(end, years);
    if (s >= today) return years;
    if (e >= today && today <= midpointYmd(s, e)) return years;
  }
  return 50;
}

export interface RenewalStepDates {
  startDate: string | null;
  completeByDate: string | null;
  minDays: number | null;
}

export interface TemplateRenewalDates {
  /** One entry per job step, in step order; null = no matching template step (keeps the job's own date). */
  steps: (RenewalStepDates | null)[];
  windowStart: string | null;
  windowEnd: string | null;
  /** Job steps with no matching template step. */
  unmatchedSteps: string[];
  /** Template steps this job doesn't have (a renewal doesn't add them). */
  missingSteps: string[];
}

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The package template's step windows for the renewed season, matched onto
 * the job's steps: service id, then name, in order. A step with Visits
 * Included N is N rows on the job (Add Job and estimate convert expand it with
 * expandPackageStepVisits), so the template is expanded the same way first —
 * matched one template step per job row, visits 2..N got no template date and
 * fell back to last season's, landing before visit 1. Min Days spacing comes
 * from computePackageVisitSchedule. The template's dates move by whole years
 * so its first date lands in `targetSeason` — a template still showing last
 * year's dates and one already updated for the new season both work. Null
 * when the template has no dated steps.
 */
export function templateRenewalDates(
  templateServices: CRMPackageService[],
  jobServices: RenewalSourceService[],
  targetSeason: number,
): TemplateRenewalDates | null {
  const named = templateServices.filter((t) => t.serviceName.trim());
  const firstTemplateDate = named.map((t) => t.startDate).filter((d): d is string => !!d).sort()[0];
  if (!firstTemplateDate) return null;
  const years = targetSeason - parseInt(firstTemplateDate.slice(0, 4), 10);

  // One slot per template visit, in program order.
  const slots = computePackageVisitSchedule(named).flatMap((v) =>
    expandPackageStepVisits(
      v.scheduledDate ? localYmd(v.scheduledDate) : null,
      v.service.endDate,
      v.service.minDays ?? null,
      v.service.visitsIncluded,
    ).map((d) => ({ serviceId: v.service.serviceId, serviceName: v.service.serviceName, ...d })),
  );

  const norm = (n: string) => n.trim().toLowerCase();
  const unused = [...slots];
  const ordered = [...jobServices].sort((a, b) => a.sort_order - b.sort_order);
  const steps = ordered.map((s): RenewalStepDates | null => {
    let i = unused.findIndex((t) => !!s.service_id && t.serviceId === s.service_id);
    if (i === -1) i = unused.findIndex((t) => norm(t.serviceName) === norm(s.service_name));
    if (i === -1) return null;
    const hit = unused.splice(i, 1)[0];
    if (!hit.startDate) return null;
    return {
      startDate: shiftYmdYears(hit.startDate, years),
      completeByDate: shiftOrNull(hit.completeByDate, years),
      minDays: hit.minDays,
    };
  });

  const starts = steps.map((s) => s?.startDate).filter((d): d is string => !!d).sort();
  const ends = steps.map((s) => s?.completeByDate ?? s?.startDate).filter((d): d is string => !!d).sort();

  return {
    steps,
    windowStart: starts[0] ?? null,
    windowEnd: ends[ends.length - 1] ?? null,
    unmatchedSteps: ordered.filter((_s, i) => !steps[i]).map((s) => s.service_name),
    // Template visits left over after matching = steps the job doesn't have.
    missingSteps: [...new Set(unused.map((t) => t.serviceName))],
  };
}

export interface BuildRenewalOptions {
  years: number;
  /** Org-local "today", stamped as Date Sold. */
  today: string;
  /** Last season's contract still covers the renewed season. */
  keepContract: boolean;
  /** "Use the package's current dates": template windows per step (see templateRenewalDates). */
  templateDates?: TemplateRenewalDates | null;
  /** "Raise rates by X%": applied to every step's rate. */
  rateIncrease?: RenewalRateIncrease | null;
}

export interface RenewalRateIncrease {
  /** Percent (5 => +5%); decimals allowed. */
  percent: number;
  rounding: RoundingRule;
}

/**
 * A step's renewed rate. Same maths and rounding as a Price Adjustment run
 * (adjustCents): a $0 step stays $0, nothing goes below $0.
 */
export function renewedRateCents(cents: number, increase: RenewalRateIncrease | null | undefined): number {
  if (!increase || !increase.percent) return cents;
  return adjustCents(cents, { method: "percent", amount: increase.percent, rounding: increase.rounding });
}

/** The Add Job form values for the renewed job. */
export function buildRenewalValues(
  job: RenewalSourceJob,
  products: RenewalSourceProduct[],
  { years, today, keepContract, templateDates, rateIncrease }: BuildRenewalOptions,
): NewClientJobFormValues {
  const services = [...(job.crm_job_services ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const stepDates = (idx: number, s: RenewalSourceService): RenewalStepDates =>
    templateDates?.steps[idx] ?? {
      startDate: shiftOrNull(s.start_date, years),
      completeByDate: shiftOrNull(s.complete_by_date, years),
      minDays: s.min_days,
    };
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
    waitingListStart: templateDates?.windowStart ?? shiftOrNull(job.waiting_list_start, years),
    waitingListEnd: templateDates?.windowEnd ?? shiftOrNull(job.waiting_list_end, years),
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
      startDate: stepDates(idx, s).startDate,
      completeByDate: stepDates(idx, s).completeByDate,
      startRecurring: null,
      assignedTo: s.assigned_to,
      qty: s.qty ?? 1,
      rateCents: renewedRateCents(s.rate_cents ?? 0, rateIncrease),
      budgetedHours: s.budgeted_hours ?? 0,
      budgetMethod: (s.budget_method ?? "manual") as BudgetMethod,
      teamSize: s.team_size ?? 1,
      daysCount: s.days_count ?? 1,
      timeStart: s.time_start,
      timeEnd: s.time_end,
      included: s.included ?? true,
      sortOrder: idx,
      minDays: stepDates(idx, s).minDays,
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
