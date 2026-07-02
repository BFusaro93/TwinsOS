"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  actualLaborCostCents: number;
  actualMaterialCostCents: number;
  actualTotalCostCents: number;
  estimatedTotalCents: number;
  estimatedCostCents: number;
  estimatedBudgetedHours: number;
  materials: JobMaterial[];
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
        .select("actual_hours, actual_labor_cost_cents, actual_material_cost_cents")
        .eq("id", jobId)
        .single();
      if (jobErr) throw new Error(jobErr.message);

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: estHeader } = await (supabase as any)
          .from("estimates")
          .select("total_cents, total_cost_cents, total_budgeted_hours")
          .eq("id", estimateId)
          .single();

        if (estHeader) {
          estimatedTotalCents = estHeader.total_cents ?? 0;
          estimatedCostCents = estHeader.total_cost_cents ?? 0;
          estimatedBudgetedHours = Number(estHeader.total_budgeted_hours ?? 0);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: lineItems } = await (supabase as any)
          .from("estimate_line_items")
          .select("service_name, budgeted_hours, cost_cents, total_cents, row_type")
          .eq("estimate_id", estimateId)
          .is("deleted_at", null)
          .eq("row_type", "item")
          .order("sort_order", { ascending: true });

        estimatedLines = (lineItems ?? []).map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (li: any): EstimatedLine => ({
            serviceName: li.service_name,
            budgetedHours: Number(li.budgeted_hours ?? 0),
            costCents: li.cost_cents ?? 0,
            revenueCents: li.total_cents ?? 0,
          })
        );
      }

      const actualLaborCostCents: number = jobRow.actual_labor_cost_cents ?? 0;
      const actualMaterialCostCents: number = jobRow.actual_material_cost_cents ?? 0;

      return {
        estimatedLines,
        actualHours: Number(jobRow.actual_hours ?? 0),
        actualLaborCostCents,
        actualMaterialCostCents,
        actualTotalCostCents: actualLaborCostCents + actualMaterialCostCents,
        estimatedTotalCents,
        estimatedCostCents,
        estimatedBudgetedHours,
        materials,
      };
    },
    enabled: !!jobId,
  });
}
