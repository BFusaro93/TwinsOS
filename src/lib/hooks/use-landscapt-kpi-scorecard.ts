"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  KpiComputedActuals,
  KpiScorecard,
  KpiScorecardEntry,
  KpiScorecardInput,
} from "@/types/crm-kpi-scorecard";

// ============================================================
// Landscapt KPI Scorecard — data hooks.
//   layout   -> /api/crm/kpi-scorecard            (GET creates the default)
//   actuals  -> /api/crm/kpi-scorecard/actuals    (live, computed per year)
//   entries  -> crm_kpi_scorecard_entries          (targets + manual actuals,
//               written straight through the RLS-scoped browser client,
//               same as the legacy kpi_actuals hook)
// ============================================================

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

const SCORECARD_QK = ["landscapt-kpi-scorecard"] as const;
const ACTUALS_QK = (period: string) => ["landscapt-kpi-actuals", period] as const;
const ENTRIES_QK = (scorecardId: string | undefined, period: string) =>
  ["landscapt-kpi-entries", scorecardId ?? "", period] as const;

export function useLandscaptKpiScorecard() {
  return useQuery<KpiScorecard>({
    queryKey: SCORECARD_QK,
    queryFn: async () => {
      const res = await fetch("/api/crm/kpi-scorecard");
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { scorecard: KpiScorecard };
      return body.scorecard;
    },
  });
}

export function useUpdateLandscaptKpiScorecard() {
  const queryClient = useQueryClient();
  return useMutation<KpiScorecard, Error, KpiScorecardInput>({
    mutationFn: async (input) => {
      const res = await fetch("/api/crm/kpi-scorecard", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { scorecard: KpiScorecard };
      return body.scorecard;
    },
    onSuccess: (scorecard) => {
      queryClient.setQueryData(SCORECARD_QK, scorecard);
    },
  });
}

export function useLandscaptKpiActuals(period: string) {
  return useQuery<KpiComputedActuals>({
    queryKey: ACTUALS_QK(period),
    queryFn: async () => {
      const res = await fetch(`/api/crm/kpi-scorecard/actuals?year=${encodeURIComponent(period)}`);
      if (!res.ok) throw new Error(await readError(res));
      return (await res.json()) as KpiComputedActuals;
    },
    staleTime: 60 * 1000,
  });
}

interface EntryRow {
  id: string;
  metric_key: string;
  period: string;
  target_value: number | string | null;
  actual_value: number | string | null;
  updated_at: string | null;
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export function useLandscaptKpiEntries(scorecardId: string | undefined, period: string) {
  return useQuery<KpiScorecardEntry[]>({
    queryKey: ENTRIES_QK(scorecardId, period),
    enabled: !!scorecardId,
    queryFn: async () => {
      const supabase = createClient();
      // crm_kpi_scorecard_entries is newer than the generated Database types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_kpi_scorecard_entries")
        .select("id, metric_key, period, target_value, actual_value, updated_at")
        .eq("scorecard_id", scorecardId)
        .eq("period", period);
      if (error) throw new Error(error.message);
      return ((data ?? []) as EntryRow[]).map((r) => ({
        id: r.id,
        metricKey: r.metric_key,
        period: r.period,
        targetValue: toNumber(r.target_value),
        actualValue: toNumber(r.actual_value),
        updatedAt: r.updated_at,
      }));
    },
  });
}

export interface UpsertKpiEntryInput {
  scorecardId: string;
  period: string;
  metricKey: string;
  targetValue?: number | null;
  actualValue?: number | null;
}

export function useUpsertLandscaptKpiEntry() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpsertKpiEntryInput, { previous?: KpiScorecardEntry[] }>({
    mutationFn: async ({ scorecardId, period, metricKey, targetValue, actualValue }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_kpi_scorecard_entries")
        .upsert(
          {
            scorecard_id: scorecardId,
            period,
            metric_key: metricKey,
            ...(targetValue !== undefined && { target_value: targetValue }),
            ...(actualValue !== undefined && { actual_value: actualValue }),
          },
          { onConflict: "scorecard_id,period,metric_key" }
        );
      if (error) throw new Error(error.message);
    },
    // Optimistic: reflect the edit immediately, roll back on failure.
    onMutate: async (vars) => {
      const qk = ENTRIES_QK(vars.scorecardId, vars.period);
      await queryClient.cancelQueries({ queryKey: qk });
      const previous = queryClient.getQueryData<KpiScorecardEntry[]>(qk);
      queryClient.setQueryData<KpiScorecardEntry[]>(qk, (old = []) => {
        const idx = old.findIndex((e) => e.metricKey === vars.metricKey);
        const base: KpiScorecardEntry =
          idx >= 0
            ? old[idx]
            : { id: `tmp-${vars.metricKey}`, metricKey: vars.metricKey, period: vars.period, targetValue: null, actualValue: null, updatedAt: null };
        const next: KpiScorecardEntry = {
          ...base,
          ...(vars.targetValue !== undefined && { targetValue: vars.targetValue }),
          ...(vars.actualValue !== undefined && { actualValue: vars.actualValue }),
          updatedAt: new Date().toISOString(),
        };
        return idx >= 0 ? old.map((e, i) => (i === idx ? next : e)) : [...old, next];
      });
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(ENTRIES_QK(vars.scorecardId, vars.period), ctx.previous);
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({ queryKey: ENTRIES_QK(vars.scorecardId, vars.period) });
    },
  });
}
