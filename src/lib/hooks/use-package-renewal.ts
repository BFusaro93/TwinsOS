"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { useCreateClientJob } from "@/lib/hooks/use-crm-jobs";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { mapPackageService } from "@/lib/hooks/use-packages";
import {
  buildRenewalValues,
  packageProgramSpan,
  packageSeasonYear,
  renewalYearsAhead,
  templateRenewalDates,
  type RenewalSourceJob,
  type RenewalSourceProduct,
  type TemplateRenewalDates,
} from "@/lib/package-renewal";
import type { CRMPackageService } from "@/types/crm-packages";
import type { NewClientJobFormValues } from "@/types/crm-jobs";

// "Renew for next season" for package jobs. The pure date/copy rules live in
// src/lib/package-renewal.ts; this file loads last season's job, checks for an
// existing renewal, and creates the new job through useCreateClientJob.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const SOURCE_COLUMNS = `
  id, job_number, client_id, property_id, job_type, status, contract_id, crew_id,
  schedule, schedule_days, package_id, package_name, package_discount, package_total_steps,
  package_renewal, conflict_days, invoice_type, sales_rep_id, source, payment_type,
  when_to_invoice, invoice_separately, call_ahead, arrival_window_hours,
  waiting_list_start, waiting_list_end, notes, notes_to_crew, invoice_description,
  clients(display_name),
  crm_job_services(id, service_id, service_name, start_date, complete_by_date, assigned_to,
    qty, rate_cents, budgeted_hours, budget_method, team_size, days_count, time_start,
    time_end, included, sort_order, min_days, is_taxable, max_visits, treated_area)
`;

type SourceRow = RenewalSourceJob & {
  job_number: number;
  status: string;
  package_renewal: string | null;
  clients: { display_name: string | null } | null;
};

export interface JobRef {
  id: string;
  jobNumber: number;
}

export interface PackageRenewalPlan {
  sourceJobId: string;
  sourceJobNumber: number;
  clientName: string;
  packageName: string | null;
  sourceSeason: number | null;
  targetSeason: number | null;
  /** First / last step date of the renewed program. */
  firstDate: string | null;
  lastDate: string | null;
  values: NewClientJobFormValues;
  /** A live renewal of this job already exists — renewing again is refused. */
  existingRenewal: JobRef | null;
  /** Another live package job for the same client, property and package already
   *  covers the target season (e.g. added by hand) — renewing needs a confirm. */
  sameSeasonJob: JobRef | null;
  /** Set when last season's contract won't carry over to the renewal. */
  contractNote: string | null;
  /** Steps whose renewed date is already before today. */
  pastStepCount: number;
  doNotRenew: boolean;
  /** Which dates `values` uses. 'template' only when asked for AND the package has dated steps. */
  dateSource: "job" | "template";
  /** The package template has dated steps, so "Use the package's current dates" is possible. */
  templateAvailable: boolean;
  /** Template-dates caveats: job steps the template doesn't have, template steps the job doesn't have. */
  templateNote: string | null;
}

function samePackage(
  a: { package_id: string | null; package_name: string | null },
  b: { package_id: string | null; package_name: string | null },
): boolean {
  if (a.package_id || b.package_id) return a.package_id === b.package_id;
  return (a.package_name ?? "").trim().toLowerCase() === (b.package_name ?? "").trim().toLowerCase();
}

/** The job's package template steps — by package id, else (older jobs) by package name. */
async function loadTemplateServices(supabase: AnyClient, job: RenewalSourceJob): Promise<CRMPackageService[]> {
  if (!job.package_id && !job.package_name?.trim()) return [];
  let q = supabase
    .from("crm_packages")
    .select("id, crm_package_services(*)")
    .is("deleted_at", null)
    .is("crm_package_services.deleted_at", null)
    .order("sort_order", { foreignTable: "crm_package_services" })
    .limit(1);
  q = job.package_id ? q.eq("id", job.package_id) : q.ilike("name", (job.package_name ?? "").trim());
  const { data, error } = await q;
  if (error) throw error;
  const pkg = (data ?? [])[0] as { crm_package_services: unknown[] | null } | undefined;
  return (pkg?.crm_package_services ?? []).map(mapPackageService);
}

function describeTemplateGaps(t: TemplateRenewalDates): string | null {
  const parts: string[] = [];
  if (t.unmatchedSteps.length > 0) {
    parts.push(`Not in the package, so kept at last season's date +1 year: ${t.unmatchedSteps.join(", ")}.`);
  }
  if (t.missingSteps.length > 0) {
    parts.push(`In the package but not on this job (not added): ${t.missingSteps.join(", ")}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

export async function loadPackageRenewalPlan(
  supabase: AnyClient,
  jobId: string,
  today: string,
  useTemplateDates = false,
): Promise<PackageRenewalPlan> {
  const { data: src, error } = await supabase
    .from("crm_jobs")
    .select(SOURCE_COLUMNS)
    .eq("id", jobId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!src) throw new Error("That job was not found (it may have been deleted).");
  const job = src as SourceRow;
  if (job.job_type !== "package") throw new Error("Only package jobs can be renewed.");

  const sourceSeason = packageSeasonYear(job);
  const years = renewalYearsAhead(packageProgramSpan(job).end, today);
  const targetSeason = sourceSeason == null ? null : sourceSeason + years;

  const template = targetSeason == null
    ? null
    : templateRenewalDates(await loadTemplateServices(supabase, job), job.crm_job_services ?? [], targetSeason);
  const templateDates = useTemplateDates ? template : null;

  const [productsRes, renewalRes, siblingsRes, contractRes] = await Promise.all([
    // Job-level planned materials only: anything recorded against a visit, or
    // generated from a service's sub-items, belongs to last season.
    supabase
      .from("crm_job_products")
      .select("product_id, product_name, qty, planned_qty, unit_price_cents, unit_cost_cents")
      .eq("job_id", jobId)
      .is("deleted_at", null)
      .is("visit_id", null)
      .is("job_service_subitem_id", null)
      .neq("status", "not_used"),
    supabase
      .from("crm_jobs")
      .select("id, job_number")
      .eq("renewed_from_job_id", jobId)
      .is("deleted_at", null)
      .limit(1),
    supabase
      .from("crm_jobs")
      .select("id, job_number, property_id, package_id, package_name, waiting_list_start, waiting_list_end, crm_job_services(start_date, complete_by_date)")
      .eq("client_id", job.client_id)
      .eq("job_type", "package")
      .neq("id", jobId)
      .is("deleted_at", null),
    job.contract_id
      ? supabase
          .from("crm_contracts")
          .select("id, title, status, end_date, deleted_at")
          .eq("id", job.contract_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [productsRes, renewalRes, siblingsRes, contractRes]) if (r.error) throw r.error;

  const renewalRow = ((renewalRes.data ?? []) as { id: string; job_number: number }[])[0];
  const existingRenewal = renewalRow ? { id: renewalRow.id, jobNumber: renewalRow.job_number } : null;

  type Sibling = {
    id: string; job_number: number; property_id: string | null;
    package_id: string | null; package_name: string | null;
    waiting_list_start: string | null; waiting_list_end: string | null;
    crm_job_services: { start_date: string | null; complete_by_date: string | null }[] | null;
  };
  const sibling = ((siblingsRes.data ?? []) as Sibling[]).find((s) =>
    s.id !== existingRenewal?.id &&
    (s.property_id ?? null) === (job.property_id ?? null) &&
    samePackage(s, job) &&
    targetSeason != null &&
    packageSeasonYear(s) === targetSeason
  );

  const values0 = buildRenewalValues(job, [], { years, today, keepContract: false, templateDates });
  const firstDate = values0.waitingListStart
    ?? values0.services.map((s) => s.startDate).filter((d): d is string => !!d).sort()[0]
    ?? null;

  let keepContract = false;
  let contractNote: string | null = null;
  const contract = contractRes.data as { title: string | null; status: string; end_date: string | null; deleted_at: string | null } | null;
  if (job.contract_id) {
    keepContract = !!contract
      && !contract.deleted_at
      && !["expired", "cancelled"].includes(contract.status)
      && (!contract.end_date || !firstDate || contract.end_date >= firstDate);
    if (!keepContract) {
      const name = contract?.title ? `"${contract.title}"` : "its contract";
      contractNote = contract?.end_date
        ? `Last season was billed under ${name}, which ends ${contract.end_date}. The renewal won't be linked to it, so it bills on its own — link a renewed contract on the new job if it should bill under one.`
        : `Last season was billed under ${name}, which is no longer active. The renewal won't be linked to it, so it bills on its own.`;
    }
  }

  const values = buildRenewalValues(job, (productsRes.data ?? []) as RenewalSourceProduct[], { years, today, keepContract, templateDates });
  const stepDates = values.services.map((s) => s.startDate).filter((d): d is string => !!d).sort();

  return {
    sourceJobId: job.id,
    sourceJobNumber: job.job_number,
    clientName: job.clients?.display_name ?? "Client",
    packageName: job.package_name,
    sourceSeason,
    targetSeason,
    firstDate,
    lastDate: values.waitingListEnd ?? stepDates[stepDates.length - 1] ?? null,
    values,
    existingRenewal,
    sameSeasonJob: sibling ? { id: sibling.id, jobNumber: sibling.job_number } : null,
    contractNote,
    pastStepCount: stepDates.filter((d) => d < today).length,
    doNotRenew: job.package_renewal === "do_not_renew",
    dateSource: templateDates ? "template" : "job",
    templateAvailable: !!template,
    templateNote: templateDates ? describeTemplateGaps(templateDates) : null,
  };
}

/** Preview of what renewing this job would create (and why it might be refused). */
export function usePackageRenewalPlan(jobId: string | null, useTemplateDates = false, enabled = true) {
  const today = todayInZone(useOrgTimeZone());
  return useQuery({
    queryKey: ["package-renewal", "plan", jobId, today, useTemplateDates],
    queryFn: () => loadPackageRenewalPlan(createClient(), jobId as string, today, useTemplateDates),
    enabled: !!jobId && enabled,
  });
}

export class PackageRenewalRefused extends Error {}

/** Copies each service's crew sub-items (products to bring / sub-services) onto the renewed job. */
async function copyServiceSubitems(supabase: AnyClient, plan: PackageRenewalPlan, newJobId: string) {
  const { data: oldServices, error: oldErr } = await supabase
    .from("crm_job_services")
    .select("id, sort_order")
    .eq("job_id", plan.sourceJobId);
  if (oldErr) throw oldErr;
  const oldIndex = new Map(
    ((oldServices ?? []) as { id: string; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s, i) => [s.id, i]),
  );
  if (oldIndex.size === 0) return;

  const { data: subitems, error: subErr } = await supabase
    .from("crm_job_service_subitems")
    .select("id, job_service_id, type, product_id, service_id, name, qty, sort_order")
    .in("job_service_id", [...oldIndex.keys()])
    .is("deleted_at", null);
  if (subErr) throw subErr;
  if (!subitems?.length) return;

  const { data: newServices, error: newErr } = await supabase
    .from("crm_job_services")
    .select("id, sort_order")
    .eq("job_id", newJobId);
  if (newErr) throw newErr;
  const newByIndex = new Map(((newServices ?? []) as { id: string; sort_order: number }[]).map((s) => [s.sort_order, s.id]));

  const rows = (subitems as { job_service_id: string; type: string; product_id: string | null; service_id: string | null; name: string; qty: number; sort_order: number | null }[])
    .map((r) => ({ r, target: newByIndex.get(oldIndex.get(r.job_service_id) ?? -1) }))
    .filter(({ target }) => !!target)
    .map(({ r, target }) => ({
      job_service_id: target,
      type: r.type,
      product_id: r.product_id,
      service_id: r.service_id,
      name: r.name,
      qty: r.qty,
      sort_order: r.sort_order ?? 0,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("crm_job_service_subitems").insert(rows);
  if (error) throw error;
}

/**
 * Renews one package job. Refuses when a renewal already exists, when the job
 * has no steps, and — unless `allowSameSeason` — when another package job for
 * the same client/property/package already covers the target season.
 */
export function useRenewPackageJob() {
  const qc = useQueryClient();
  const createJob = useCreateClientJob();
  const today = todayInZone(useOrgTimeZone());
  return useMutation({
    mutationFn: async ({
      jobId,
      allowSameSeason = false,
      useTemplateDates = false,
    }: { jobId: string; allowSameSeason?: boolean; useTemplateDates?: boolean }) => {
      const supabase = createClient();
      // Always re-read: a preview can be stale (someone else renewed meanwhile).
      // useTemplateDates falls back to the job's own dates when the package has none.
      const plan = await loadPackageRenewalPlan(supabase, jobId, today, useTemplateDates);
      if (plan.existingRenewal) {
        throw new PackageRenewalRefused(`Already renewed as job #${plan.existingRenewal.jobNumber}.`);
      }
      if (plan.values.services.length === 0) {
        throw new PackageRenewalRefused("This job has no services to renew.");
      }
      if (plan.sameSeasonJob && !allowSameSeason) {
        throw new PackageRenewalRefused(
          `Job #${plan.sameSeasonJob.jobNumber} already has this package for ${plan.targetSeason ?? "that season"}.`,
        );
      }
      let created: { id: string };
      try {
        created = (await createJob.mutateAsync(plan.values)) as { id: string };
      } catch (err) {
        // crm_jobs_renewed_from_live_uidx — renewed by someone else in the meantime.
        if ((err as { code?: string } | null)?.code === "23505") {
          throw new PackageRenewalRefused("This job was just renewed by someone else.");
        }
        throw err;
      }
      // Sub-items are a crew checklist (no money); a failure here leaves a usable job.
      await copyServiceSubitems(supabase, plan, created.id).catch(() => {});
      return { newJobId: created.id, targetSeason: plan.targetSeason, dateSource: plan.dateSource };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["package-renewal"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
    },
  });
}

/** Sets crm_jobs.package_renewal: 'do_not_renew', or null to renew as usual. */
export function useSetPackageRenewalSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ jobId, doNotRenew }: { jobId: string; doNotRenew: boolean }) => {
      const supabase = createClient();
      const { error } = await (supabase as AnyClient)
        .from("crm_jobs")
        .update({ package_renewal: doNotRenew ? "do_not_renew" : null })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: (_d, { jobId }) => {
      qc.invalidateQueries({ queryKey: ["package-renewal"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs", "detail", jobId] });
    },
  });
}

export interface PackageRenewalCandidate {
  id: string;
  jobNumber: number;
  clientName: string;
  packageName: string | null;
  status: string;
  season: number | null;
  totalCents: number;
  doNotRenew: boolean;
  renewedTo: JobRef | null;
}

/** Every live package job with its season and renewal state — the bulk Renew Packages list. */
export function usePackageRenewalCandidates(enabled = true) {
  return useQuery({
    queryKey: ["package-renewal", "candidates"],
    enabled,
    queryFn: async (): Promise<PackageRenewalCandidate[]> => {
      const supabase = createClient();
      type Row = {
        id: string; job_number: number; status: string; package_name: string | null;
        package_renewal: string | null; renewed_from_job_id: string | null; total_cents: number | null;
        waiting_list_start: string | null; waiting_list_end: string | null;
        clients: { display_name: string | null } | null;
        crm_job_services: { start_date: string | null; complete_by_date: string | null }[] | null;
      };
      const rows = await fetchAllRows<Row>(() =>
        (supabase as AnyClient)
          .from("crm_jobs")
          .select("id, job_number, status, package_name, package_renewal, renewed_from_job_id, total_cents, waiting_list_start, waiting_list_end, clients(display_name), crm_job_services(start_date, complete_by_date)")
          .eq("job_type", "package")
          .is("deleted_at", null)
      );
      const renewalOf = new Map<string, JobRef>();
      for (const r of rows) {
        if (r.renewed_from_job_id) renewalOf.set(r.renewed_from_job_id, { id: r.id, jobNumber: r.job_number });
      }
      return rows
        .map((r) => ({
          id: r.id,
          jobNumber: r.job_number,
          clientName: r.clients?.display_name ?? "",
          packageName: r.package_name,
          status: r.status,
          season: packageSeasonYear(r),
          totalCents: r.total_cents ?? 0,
          doNotRenew: r.package_renewal === "do_not_renew",
          renewedTo: renewalOf.get(r.id) ?? null,
        }))
        .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.jobNumber - b.jobNumber);
    },
  });
}

/** The job this one was renewed from, and the job it was renewed into. */
export function useJobRenewalLinks(jobId: string, renewedFromJobId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["package-renewal", "links", jobId, renewedFromJobId],
    enabled: !!jobId && enabled,
    queryFn: async (): Promise<{ renewedFrom: JobRef | null; renewedTo: JobRef | null }> => {
      const supabase = createClient() as AnyClient;
      const [toRes, fromRes] = await Promise.all([
        supabase.from("crm_jobs").select("id, job_number").eq("renewed_from_job_id", jobId).is("deleted_at", null).limit(1),
        renewedFromJobId
          ? supabase.from("crm_jobs").select("id, job_number").eq("id", renewedFromJobId).is("deleted_at", null).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (toRes.error) throw toRes.error;
      if (fromRes.error) throw fromRes.error;
      const to = (toRes.data ?? [])[0] as { id: string; job_number: number } | undefined;
      const from = fromRes.data as { id: string; job_number: number } | null;
      return {
        renewedTo: to ? { id: to.id, jobNumber: to.job_number } : null,
        renewedFrom: from ? { id: from.id, jobNumber: from.job_number } : null,
      };
    },
  });
}
