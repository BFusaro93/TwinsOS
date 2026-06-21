import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface KpiActual {
  id: string;
  metricKey: string;
  period: string;
  targetValue: number | null;
  actualValue: number | null;
  updatedAt: string | null;
}

const QK = (period: string) => ["kpi-actuals", period];

export function useKpiActuals(period: string) {
  return useQuery({
    queryKey: QK(period),
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("kpi_actuals")
        .select("id, metric_key, period, target_value, actual_value, updated_at")
        .eq("period", period);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        metricKey: r.metric_key,
        period: r.period,
        targetValue: r.target_value !== null ? Number(r.target_value) : null,
        actualValue: r.actual_value !== null ? Number(r.actual_value) : null,
        updatedAt: r.updated_at ?? null,
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
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", userData.user!.id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("kpi_actuals")
        .upsert(
          {
            org_id: profile!.org_id,
            period,
            metric_key: metricKey,
            ...(targetValue !== undefined && { target_value: targetValue }),
            ...(actualValue !== undefined && { actual_value: actualValue }),
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
