"use client";

import { useQuery } from "@/lib/hooks/use-query";
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const viewRes = await (supabase as any)
        .from("rpt_job_services")
        .select("*")
        .eq("service_id", serviceId)
        // Per-visit status: a recurring job's master status stays
        // 'scheduled' while its visits complete one by one.
        .eq("visit_status", "completed")
        .order("scheduled_date", { ascending: false })
        .limit(1000);
      if (viewRes.error) throw viewRes.error;

      // Rates are looked up for exactly the job services the view returned
      // (in chunks, to keep the URL short). Reading every crm_job_services row
      // of the service instead stops at PostgREST's 1000-row cap, so for a
      // widely-sold service the rows past it came back with no rate and showed
      // $0 revenue.
      const jobServiceIds = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...new Set<string>((viewRes.data ?? []).map((r: any) => r.job_service_id as string).filter(Boolean)),
      ];
      const rateCentsById = new Map<string, number>();
      for (let i = 0; i < jobServiceIds.length; i += 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rateRes = await (supabase as any)
          .from("crm_job_services")
          .select("id, rate_cents")
          .in("id", jobServiceIds.slice(i, i + 200));
        if (rateRes.error) throw rateRes.error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const r of (rateRes.data ?? []) as any[]) rateCentsById.set(r.id as string, (r.rate_cents ?? 0) as number);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (viewRes.data ?? []).map((r: any) => {
        const qty = Number(r.qty) || 0;
        // r.id is the view's composite "visitId-jobServiceId" key — the rate
        // lookup keys off crm_job_services.id, which is r.job_service_id.
        const rateCents = rateCentsById.get(r.job_service_id) ?? 0;
        return {
          id: r.id,
          jobId: r.job_id,
          scheduledDate: r.scheduled_date,
          clientName: r.client_name,
          budgetMethod: r.budget_method,
          qty,
          // budgeted_hours is already man-hours (service hours × team size).
          budgetedHours: Number(r.budgeted_hours) || 0,
          // actual_man_hours is this visit's man-hour share of the service;
          // it's the same expression as job_actual_hours in the view but
          // coalesced to 0 — null it out when the visit has no hours so the
          // UI can show a blank rather than a fake 0.
          actualHours:
            r.actual_man_hours != null && Number(r.actual_man_hours) > 0
              ? Number(r.actual_man_hours)
              : null,
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
