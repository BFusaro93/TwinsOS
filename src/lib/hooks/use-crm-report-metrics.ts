"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CrmReportMetrics {
  new_leads_ytd?: number | null;
  new_clients_ytd?: number | null;
  lead_conversion_rate?: number | null; // percent, e.g. 53.33
  close_ratio?: number | null;          // percent, won / total estimates
  won_estimates_ytd?: number | null;    // dollars
  open_estimates_pipeline?: number | null; // dollars
  invoiced_revenue_ytd?: number | null;   // dollars
  ar_outstanding?: number | null;         // dollars
  updated_at?: string | null;
}

export function useCrmReportMetrics() {
  return useQuery<CrmReportMetrics>({
    queryKey: ["crm-report-metrics"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_reports")
        .select("metrics, updated_at")
        .eq("id", "latest")
        .single();
      if (error || !data?.metrics) return {};
      return { ...(data.metrics as CrmReportMetrics), updated_at: data.updated_at };
    },
    staleTime: 5 * 60 * 1000,
  });
}
