"use client";

import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { isSnowContractEnded, loadContractsById } from "@/lib/hooks/use-snow-invoicing";
import { loadSnowCapStatuses } from "@/lib/snow-cap-loader";
import type { SnowCapKind, SnowCapStatus } from "@/lib/snow-caps";

/** Cap usage per contract id (only contracts that have a cap get an entry). */
async function loadStatuses(contractIds: string[], today: string): Promise<Map<string, SnowCapStatus>> {
  const supabase = createClient();
  const contracts = await loadContractsById(supabase, contractIds);
  return loadSnowCapStatuses(
    supabase,
    [...contracts.values()] as Parameters<typeof loadSnowCapStatuses>[1],
    (contractId, day) => !isSnowContractEnded(contracts.get(contractId), day),
    today
  );
}

/** One contract's cap usage for its current period (null when it has no cap). */
export function useSnowCapStatus(contractId?: string) {
  const tz = useOrgTimeZone();
  return useQuery({
    queryKey: ["snow-caps", "contract", contractId, tz],
    enabled: !!contractId,
    queryFn: async () => (await loadStatuses([contractId as string], todayInZone(tz))).get(contractId as string) ?? null,
  });
}

export interface SnowCapJobFlag {
  /** The job's next stop would bill as overage (its cap is already used up). */
  over: boolean;
  /** "42 of 80 in used" / "35 of 35 salts used". */
  label: string;
}

/** Dispatch board: per job id, whether its contract's cap is already used up. */
export function useSnowCapJobFlags(contractIds: string[]) {
  const tz = useOrgTimeZone();
  const ids = [...new Set(contractIds)].sort();
  return useQuery({
    queryKey: ["snow-caps", "job-flags", ids, tz],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Map<string, SnowCapJobFlag>> => {
      const out = new Map<string, SnowCapJobFlag>();
      const statuses = await loadStatuses(ids, todayInZone(tz));
      if (statuses.size === 0) return out;
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_jobs")
        .select("id, contract_id, snow_cap_kind")
        .in("contract_id", [...statuses.keys()])
        .is("deleted_at", null);
      if (error) throw error;
      for (const j of (data ?? []) as { id: string; contract_id: string; snow_cap_kind: string | null }[]) {
        const st = statuses.get(j.contract_id);
        if (!st) continue;
        const kind: SnowCapKind = j.snow_cap_kind === "salt" ? "salt" : "inches";
        const labels: string[] = [];
        let over = false;
        if (kind === "salt") {
          if (st.saltCap != null) {
            labels.push(`${st.saltsByJob.get(j.id) ?? 0} of ${st.saltCap} salts used`);
            over = st.saltAtCapByJob.get(j.id) ?? false;
          }
        } else {
          if (st.inchCap != null) { labels.push(`${st.inchesUsed} of ${st.inchCap} in used`); over ||= st.inchesAtCap; }
          if (st.eventsCap != null) { labels.push(`${st.eventsUsed} of ${st.eventsCap} events used`); over ||= st.eventsAtCap; }
          if (st.pushesCap != null) { labels.push(`${st.pushesByJob.get(j.id) ?? 0} of ${st.pushesCap} pushes used`); over ||= st.pushesAtCapByJob.get(j.id) ?? false; }
        }
        if (labels.length > 0) out.set(j.id, { over, label: labels.join(", ") });
      }
      return out;
    },
  });
}
