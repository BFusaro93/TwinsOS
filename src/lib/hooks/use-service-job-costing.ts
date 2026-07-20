"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ServiceJobCostRow {
  id: string;
  jobId: string;
  scheduledDate: string | null;
  clientName: string;
  budgetMethod: "manual" | "production_rate";
  qty: number;
  budgetedHours: number;
  actualHours: number | null;
  manCount: number;
  actualManHours: number;
  assumedProductionRate: number | null;
  actualProductionRate: number | null;
  rateVarianceBps: number | null;
  revenueCents: number;
}

/**
 * Completed job instances of a single service, for the Service dialog's Job
 * Costing tab. Reads production-rate accuracy fields from rpt_job_services
 * (same view the Report Center's Production Rate Accuracy report uses) and
 * merges in rate_cents from crm_job_services (the view has no $ columns —
 * it's scoped to hours/rate accuracy) to compute revenue per instance.
 */
export function useServiceJobCosting(serviceId: string) {
  return useQuery({
    queryKey: ["service-job-costing", serviceId],
    queryFn: async (): Promise<ServiceJobCostRow[]> => {
      const supabase = createClient();
      const [viewRes, rateRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("rpt_job_services")
          .select("*")
          .eq("service_id", serviceId)
          .eq("job_status", "completed")
          .order("scheduled_date", { ascending: false })
          .limit(1000),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("crm_job_services")
          .select("id, rate_cents")
          .eq("service_id", serviceId),
      ]);
      if (viewRes.error) throw viewRes.error;
      if (rateRes.error) throw rateRes.error;

      const rateCentsById = new Map<string, number>(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rateRes.data ?? []).map((r: any) => [r.id as string, (r.rate_cents ?? 0) as number])
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (viewRes.data ?? []).map((r: any) => {
        const qty = Number(r.qty) || 0;
        const rateCents = rateCentsById.get(r.id) ?? 0;
        return {
          id: r.id,
          jobId: r.job_id,
          scheduledDate: r.scheduled_date,
          clientName: r.client_name,
          budgetMethod: r.budget_method,
          qty,
          budgetedHours: Number(r.budgeted_hours) || 0,
          actualHours: r.job_actual_hours != null ? Number(r.job_actual_hours) : null,
          manCount: r.man_count ?? 1,
          actualManHours: Number(r.actual_man_hours) || 0,
          assumedProductionRate: r.assumed_production_rate != null ? Number(r.assumed_production_rate) : null,
          actualProductionRate: r.actual_production_rate != null ? Number(r.actual_production_rate) : null,
          rateVarianceBps: r.rate_variance_bps ?? null,
          revenueCents: Math.round(qty * rateCents),
        };
      });
    },
    enabled: !!serviceId,
  });
}
