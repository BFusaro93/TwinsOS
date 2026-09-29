import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/** One work order's cost breakdown, in cents. */
export interface WOCostSummary {
  id: string;
  assetId: string | null;
  assetName: string | null;
  isPreventive: boolean;
  /** completed_at, falling back to created_at for work orders still in flight (matches cmms_asset_metrics). */
  costAt: string;
  partsCents: number;
  laborCents: number;
  vendorCents: number;
}

interface WOCostRow {
  id: string;
  asset_id: string | null;
  asset_name: string | null;
  wo_type: string | null;
  pm_schedule_id: string | null;
  created_at: string;
  completed_at: string | null;
  wo_parts: { quantity: number; unit_cost: number; deleted_at: string | null }[] | null;
  wo_labor_entries: { hours: number; hourly_rate: number; deleted_at: string | null }[] | null;
  wo_vendor_charges: { cost: number; deleted_at: string | null }[] | null;
}

/**
 * Parts, labor and vendor/sub charges for every non-skipped work order.
 * Same cost definition as the cmms_asset_metrics RPC so the report and the
 * per-asset cost figures agree.
 */
export function useWOCostSummary() {
  return useQuery({
    queryKey: ["wo-cost-summary"],
    queryFn: async () => {
      const supabase = createClient();
      const pageSize = 1000;
      const rows: WOCostRow[] = [];
      let from = 0;
      // PostgREST caps unbounded selects at ~1000 rows — page explicitly.
      while (true) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("work_orders")
          .select(
            "id, asset_id, asset_name, wo_type, pm_schedule_id, created_at, completed_at, wo_parts(quantity, unit_cost, deleted_at), wo_labor_entries(hours, hourly_rate, deleted_at), wo_vendor_charges(cost, deleted_at)"
          )
          .is("deleted_at", null)
          .neq("status", "skipped")
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...(data as WOCostRow[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return rows.map<WOCostSummary>((r) => ({
        id: r.id,
        assetId: r.asset_id,
        assetName: r.asset_name,
        isPreventive: r.wo_type === "preventive" || r.pm_schedule_id !== null,
        costAt: r.completed_at ?? r.created_at,
        partsCents: (r.wo_parts ?? []).filter((p) => !p.deleted_at).reduce((s, p) => s + p.quantity * p.unit_cost, 0),
        laborCents: (r.wo_labor_entries ?? []).filter((l) => !l.deleted_at).reduce((s, l) => s + Math.round(l.hours * l.hourly_rate), 0),
        vendorCents: (r.wo_vendor_charges ?? []).filter((c) => !c.deleted_at).reduce((s, c) => s + c.cost, 0),
      }));
    },
  });
}
