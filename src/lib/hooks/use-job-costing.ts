"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

// ── types ─────────────────────────────────────────────────────────────────────

export interface JobMaterial {
  id: string;
  jobId: string;
  visitId: string | null;
  description: string;
  qty: number;
  unitCostCents: number;
  totalCostCents: number;
  notes: string | null;
  createdAt: string;
}

export interface EstimatedLine {
  serviceName: string;
  budgetedHours: number;
  costCents: number;
  revenueCents: number;
}

export interface JobCostingData {
  estimatedLines: EstimatedLine[];
  actualHours: number;
  menCount: number;
  actualStaffHrs: number;
  actualLaborCostCents: number;
  actualMaterialCostCents: number;
  actualTotalCostCents: number;
  estimatedTotalCents: number;
  estimatedCostCents: number;
  estimatedBudgetedHours: number;
  /** Σ the live visits' own budgeted hours (cancelled/skipped excluded) — what
   *  the dispatch board shows. Differs from estimatedBudgetedHours when the
   *  schedule was changed after the estimate was written. */
  scheduledBudgetedHours: number;
  targetRateCentsPerHr: number;
  actualRevPerManHrCents: number;
  targetOverUnderCents: number;
  materials: JobMaterial[];
  /** From the job's (first) service — which budgeting style drove budgetedHours. */
  budgetMethod: "manual" | "production_rate";
  /** Where actualLaborCostCents came from, per rpt_job_visits.labor_cost_source:
   *  crew clock-out punches ("actual"), man-hours × the crew's average rate
   *  ("estimated"), a mix of the two, or no labor rate configured ("none"). */
  laborCostSource: "actual" | "estimated" | "mixed" | "none";
  /** "estimate" when estimatedTotalCents/estimatedBudgetedHours come from the
   *  job's source estimate; "visits" when the job has none (recurring/one-time
   *  jobs) and they're summed from the worked visits' own budget and revenue. */
  estimateSource: "estimate" | "visits";
}

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMaterial(row: any): JobMaterial {
  return {
    id: row.id,
    jobId: row.job_id,
    visitId: row.visit_id ?? null,
    description: row.description,
    qty: Number(row.qty),
    unitCostCents: row.unit_cost_cents,
    totalCostCents: row.total_cost_cents,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

// ── hooks ─────────────────────────────────────────────────────────────────────

export function useJobMaterials(jobId: string) {
  const supabase = createClient();
  return useQuery<JobMaterial[]>({
    queryKey: ["crm-job-materials", jobId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_job_materials")
        .select("*")
        .eq("job_id", jobId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(mapMaterial);
    },
    enabled: !!jobId,
  });
}

export function useAddJobMaterial(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      description: string;
      qty: number;
      unitCostCents: number;
      visitId?: string | null;
      notes?: string | null;
    }) => {
      const res = await fetch(`/api/crm/jobs/${jobId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to add material");
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-job-materials", jobId] });
      void qc.invalidateQueries({ queryKey: ["crm-job-detail", jobId] });
    },
  });
}

export function useDeleteJobMaterial(jobId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (materialId: string) => {
      const res = await fetch(`/api/crm/jobs/${jobId}/materials/${materialId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to delete material");
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["crm-job-materials", jobId] });
      void qc.invalidateQueries({ queryKey: ["crm-job-detail", jobId] });
    },
  });
}

export function useJobCosting(jobId: string, estimateId?: string | null): {
  data: JobCostingData | undefined;
  isLoading: boolean;
  error: Error | null;
} {
  const supabase = createClient();

  return useQuery<JobCostingData>({
    queryKey: ["crm-job-costing", jobId, estimateId],
    queryFn: async () => {
      // Fetch job row for actuals
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: jobRow, error: jobErr } = await (supabase as any)
        .from("crm_jobs")
        .select("actual_material_cost_cents")
        .eq("id", jobId)
        .single();
      if (jobErr) throw new Error(jobErr.message);

      // Fetch men_count from most recent completed visit
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: visitRow } = await (supabase as any)
        .from("crm_job_visits")
        .select("men_count")
        .eq("job_id", jobId)
        .is("deleted_at", null)
        .not("clocked_out_at", "is", null)
        .order("clocked_out_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // service_id/budget_method live on crm_job_services (crm_jobs has no
      // service_id column) — a job can have multiple services, so this takes
      // the first for the single target-rate/budget-method display below.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: jobServiceRow } = await (supabase as any)
        .from("crm_job_services")
        .select("service_id, budget_method")
        .eq("job_id", jobId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      let targetRateCentsPerHr = 0;
      const serviceId: string | null = jobServiceRow?.service_id ?? null;
      const budgetMethod: "manual" | "production_rate" = jobServiceRow?.budget_method ?? "manual";
      if (serviceId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: svc } = await (supabase as any)
          .from("crm_services")
          .select("target_rate_cents_per_hr")
          .eq("id", serviceId)
          .maybeSingle();
        targetRateCentsPerHr = svc?.target_rate_cents_per_hr ?? 0;
      }

      // Hours, labor cost, budget and revenue all come from rpt_job_visits —
      // the same view the Job Costing and COGS reports read — over the job's
      // worked visits (completed or in progress; scheduled visits can carry
      // planned start/end times that are not work done). Labor there resolves
      // crew clock-out punches first, else man-hours × the crew's average rate,
      // so a visit the office completed by hand still carries a labor cost;
      // crm_jobs.actual_labor_cost_cents only ever holds the punch-based part.
      //
      // Revenue per man-hour is sum(revenue) / sum(man-hours) over the job's
      // completed visits — not one visit's rate over the job's lifetime hours
      // (which mixed a single visit's revenue with every visit's hours).
      let completedRevenueCents = 0;
      let completedManHours = 0;
      let workedManHours = 0;
      let workedLaborCents = 0;
      let workedBudgetedHours = 0;
      let scheduledBudgetedHours = 0;
      let workedRevenueCents = 0;
      const laborSources = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: workedVisits } = await (supabase as any)
        .from("crm_job_visits")
        .select("id, status")
        .eq("job_id", jobId)
        .not("status", "in", "(cancelled,skipped)")
        .is("deleted_at", null);
      const visitStatus = new Map<string, string>(
        (workedVisits ?? []).map((v: { id: string; status: string }) => [v.id, v.status])
      );
      const isWorked = (id: string) => {
        const st = visitStatus.get(id);
        return st === "completed" || st === "in_progress";
      };
      if (visitStatus.size > 0) {
        // Chunked: a long-running job (a daily snow or weekly route over seasons)
        // can have hundreds of visits, and one `.in()` of that many uuids blows the
        // URL limit — the request failed, `visitCosts` came back null and the whole
        // costing panel read 0 hours / $0 labor with no error.
        const visitIds = [...visitStatus.keys()];
        const visitCosts: unknown[] = [];
        for (let i = 0; i < visitIds.length; i += 100) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: chunk, error: chunkErr } = await (supabase as any)
            .from("rpt_job_visits")
            .select("id, revenue_cents, man_hours, budgeted_hours, actual_labor_cost_cents, labor_cost_source")
            .in("id", visitIds.slice(i, i + 100));
          if (chunkErr) throw new Error(chunkErr.message);
          visitCosts.push(...(chunk ?? []));
        }
        for (const vc of visitCosts as {
          id: string;
          revenue_cents: number | null;
          man_hours: number | string | null;
          budgeted_hours: number | string | null;
          actual_labor_cost_cents: number | null;
          labor_cost_source: string | null;
        }[]) {
          scheduledBudgetedHours += Number(vc.budgeted_hours ?? 0);
          if (!isWorked(vc.id)) continue;
          const hrs = Number(vc.man_hours ?? 0);
          workedManHours += hrs;
          workedLaborCents += vc.actual_labor_cost_cents ?? 0;
          workedBudgetedHours += Number(vc.budgeted_hours ?? 0);
          workedRevenueCents += vc.revenue_cents ?? 0;
          if (hrs > 0 && vc.labor_cost_source) laborSources.add(vc.labor_cost_source);
          // A visit with no recorded hours would add its revenue with 0 hours
          // and inflate the rate — leave it out of both sums.
          if (hrs > 0 && visitStatus.get(vc.id) === "completed") {
            completedManHours += hrs;
            completedRevenueCents += vc.revenue_cents ?? 0;
          }
        }
      }
      const laborCostSource: JobCostingData["laborCostSource"] =
        laborSources.size === 0 || (laborSources.size === 1 && laborSources.has("none"))
          ? "none"
          : laborSources.has("actual") && (laborSources.has("estimated") || laborSources.has("none"))
            ? "mixed"
            : laborSources.has("actual")
              ? "actual"
              : "estimated";

      // Fetch materials
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: materialsData, error: matErr } = await (supabase as any)
        .from("crm_job_materials")
        .select("*")
        .eq("job_id", jobId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (matErr) throw new Error(matErr.message);

      const materials: JobMaterial[] = (materialsData ?? []).map(mapMaterial);

      // Fetch estimate line items if we have an estimateId
      let estimatedLines: EstimatedLine[] = [];
      let estimatedTotalCents = 0;
      let estimatedCostCents = 0;
      let estimatedBudgetedHours = 0;

      if (estimateId) {
        // total_cost_cents lives on estimate_line_items, not estimates —
        // selecting it here made PostgREST 400, and the discarded error left
        // estHeader null, so estimated revenue AND budgeted hours both read 0
        // as well. The estimate's cost is the sum of its lines' extended cost,
        // accumulated from the line-item query below.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: estHeader } = await (supabase as any)
          .from("estimates")
          .select("total_cents, total_budgeted_hours")
          .eq("id", estimateId)
          .single();

        if (estHeader) {
          estimatedTotalCents = estHeader.total_cents ?? 0;
          estimatedBudgetedHours = Number(estHeader.total_budgeted_hours ?? 0);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lineItems } = await (supabase as any)
          .from("estimate_line_items")
          .select("service_name, budgeted_hours, cost_cents, total_cost_cents, total_cents, row_type")
          .eq("estimate_id", estimateId)
          .is("deleted_at", null)
          // Only lines that are part of the agreed quote: a lost tier / unticked
          // option or a never-quoted draft isn't work this job was sold to do, but
          // its revenue and cost were summed into the "estimated" side.
          .not("status", "in", "(lost,draft)")
          .eq("row_type", "item")
          .order("sort_order", { ascending: true });

        estimatedLines = (lineItems ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (li: any): EstimatedLine => ({
            serviceName: li.service_name,
            budgetedHours: Number(li.budgeted_hours ?? 0),
            // total_cost_cents is the EXTENDED cost (qty × cost_cents).
            // cost_cents is the per-unit cost, so summing it across lines — as
            // the caller does to get estimated labor cost — produced a number
            // with no meaning, and it sat next to an extended revenue figure.
            costCents: li.total_cost_cents ?? 0,
            revenueCents: li.total_cents ?? 0,
          })
        );

        // Estimated cost = labor (the lines above) + direct costs (materials,
        // equipment, subs). The caller derives its material figure as
        // total − labor, so both halves have to be included here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: directCosts } = await (supabase as any)
          .from("estimate_direct_costs")
          .select("total_cents")
          .eq("estimate_id", estimateId)
          .is("deleted_at", null);

        const laborCostCents = estimatedLines.reduce((s, l) => s + l.costCents, 0);
        const directCostCents = (directCosts ?? []).reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: number, d: any) => s + (d.total_cents ?? 0),
          0
        );
        estimatedCostCents = laborCostCents + directCostCents;
      }

      // Without a source estimate (recurring / one-time jobs), the budget and
      // revenue to compare against are the worked visits' own — each visit
      // already carries its budget (visit → service → job) and revenue.
      const estimateSource: JobCostingData["estimateSource"] = estimateId ? "estimate" : "visits";
      if (!estimateId) {
        estimatedTotalCents = workedRevenueCents;
        estimatedBudgetedHours = workedBudgetedHours;
      }

      // man_hours is already man-hours (duration × each visit's men_count) —
      // multiplying by this job's men_count again would double-count crew
      // size, halving the displayed actual revenue-per-man-hour for any
      // multi-person crew.
      const actualHours = Math.round(workedManHours * 100) / 100;
      const menCount = Number(visitRow?.men_count ?? 1);
      const actualStaffHrs = actualHours;
      const actualRevPerManHrCents = completedManHours > 0
        ? Math.round(completedRevenueCents / completedManHours)
        : 0;
      const targetOverUnderCents = actualRevPerManHrCents - targetRateCentsPerHr;
      const actualLaborCostCents: number = workedLaborCents;
      const actualMaterialCostCents: number = jobRow.actual_material_cost_cents ?? 0;

      return {
        estimatedLines,
        actualHours,
        menCount,
        actualStaffHrs,
        actualLaborCostCents,
        actualMaterialCostCents,
        actualTotalCostCents: actualLaborCostCents + actualMaterialCostCents,
        estimatedTotalCents,
        estimatedCostCents,
        estimatedBudgetedHours,
        scheduledBudgetedHours: Math.round(scheduledBudgetedHours * 100) / 100,
        targetRateCentsPerHr,
        actualRevPerManHrCents,
        targetOverUnderCents,
        materials,
        budgetMethod,
        laborCostSource,
        estimateSource,
      };
    },
    enabled: !!jobId,
  });
}
