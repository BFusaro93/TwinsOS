import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface KpiActual {
  id: string;
  metricKey: string;
  period: string;
  targetValue: number | null;
  actualValue: number | null;
}

const QK = (period: string) => ["kpi-actuals", period];

export function useKpiActuals(period: string) {
  return useQuery({
    queryKey: QK(period),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("kpi_actuals")
        .select("id, metric_key, period, target_value, actual_value")
        .eq("period", period);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        metricKey: r.metric_key,
        period: r.period,
        targetValue: r.target_value !== null ? Number(r.target_value) : null,
        actualValue: r.actual_value !== null ? Number(r.actual_value) : null,
      })) as KpiActual[];
    },
  });
}

export function useUpsertKpiActual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      period,
      metricKey,
      targetValue,
      actualValue,
    }: {
      period: string;
      metricKey: string;
      targetValue?: number | null;
      actualValue?: number | null;
    }) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("kpi_actuals")
        .upsert(
          {
            period,
            metric_key: metricKey,
            ...(targetValue !== undefined && { target_value: targetValue }),
            ...(actualValue !== undefined && { actual_value: actualValue }),
            updated_at: new Date().toISOString(),
            created_by: userData.user?.id,
          },
          { onConflict: "org_id,period,metric_key" }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: QK(vars.period) });
    },
  });
}
