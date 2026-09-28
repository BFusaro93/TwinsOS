import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { AssetMetrics, AssetStatus, PMOutcome, PMOutcomeRow } from "@/types/cmms";

/**
 * Uptime, downtime, MTTR, maintenance cost and PM compliance per asset and
 * vehicle, computed in the database (cmms_asset_metrics). Window-based
 * figures cover the trailing `windowDays`; costs are always trailing 12
 * months and lifetime. Pass `assetId` for a single record.
 */
export function useAssetMetrics(windowDays: number, assetId?: string) {
  return useQuery({
    queryKey: ["asset-metrics", windowDays, assetId ?? "all"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("cmms_asset_metrics", {
        p_window_days: windowDays,
        ...(assetId ? { p_asset_id: assetId } : {}),
      });
      if (error) throw error;
      return (data ?? []).map((r): AssetMetrics => ({
        entityType: r.entity_type as AssetMetrics["entityType"],
        assetId: r.asset_id,
        name: r.name,
        assetTag: r.asset_tag,
        assetType: r.asset_type,
        status: r.status as AssetStatus,
        location: r.location,
        purchasePrice: r.purchase_price,
        warrantyEndDate: r.warranty_end_date,
        windowDays: r.window_days,
        uptimePct: r.uptime_pct,
        inServiceHours: r.in_service_hours ?? 0,
        downtimeHours: r.downtime_hours ?? 0,
        downtimeEvents: r.downtime_events,
        mttrHours: r.mttr_hours,
        downSince: r.down_since,
        woCount: r.wo_count,
        openWoCount: r.open_wo_count,
        cost12moCents: r.cost_12mo_cents,
        pmCost12moCents: r.pm_cost_12mo_cents,
        costLifetimeCents: r.cost_lifetime_cents,
        pmCostLifetimeCents: r.pm_cost_lifetime_cents,
        pmDue: r.pm_due,
        pmCompleted: r.pm_completed,
        pmOnTime: r.pm_on_time,
        pmLate: r.pm_late,
        pmSkipped: r.pm_skipped,
        pmOverdue: r.pm_overdue,
        pmNotGenerated: r.pm_not_generated,
      }));
    },
    staleTime: 30_000,
  });
}

/**
 * Every PM unit — scheduled or meter-triggered, generated or not — due on or
 * after `fromDate` ("YYYY-MM-DD"), with its compliance outcome.
 */
export function usePMOutcomes(fromDate: string) {
  return useQuery({
    queryKey: ["pm-outcomes", fromDate],
    queryFn: async () => {
      const supabase = createClient();
      // PostgREST caps a response at 1000 rows, which a year of weekly PMs
      // across a fleet passes easily — the report silently lost the oldest
      // units. Page through with a total order (due_on alone ties) until a
      // short page comes back.
      const PAGE = 1000;
      const data: {
        source: string | null; program_id: string | null; program_name: string | null;
        work_order_id: string | null; work_order_number: string | null; asset_id: string | null;
        asset_name: string | null; due_date: string | null; due_on: string | null;
        completed_on: string | null; outcome: string | null;
      }[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: page, error } = await supabase
          .from("v_pm_outcomes")
          .select("source, program_id, program_name, work_order_id, work_order_number, asset_id, asset_name, due_date, due_on, completed_on, outcome")
          .gte("due_on", fromDate)
          .order("due_on", { ascending: false })
          .order("source", { ascending: true })
          .order("program_id", { ascending: true })
          .order("asset_id", { ascending: true })
          .order("work_order_id", { ascending: true, nullsFirst: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        data.push(...(page ?? []));
        if (!page || page.length < PAGE) break;
      }
      return (data ?? []).map((r): PMOutcomeRow => ({
        source: (r.source ?? "schedule") as PMOutcomeRow["source"],
        programId: r.program_id ?? "",
        programName: r.program_name,
        workOrderId: r.work_order_id,
        workOrderNumber: r.work_order_number,
        assetId: r.asset_id,
        assetName: r.asset_name,
        dueDate: r.due_date,
        dueOn: r.due_on ?? fromDate,
        completedOn: r.completed_on,
        outcome: (r.outcome ?? "pending") as PMOutcome,
      }));
    },
    staleTime: 30_000,
  });
}
