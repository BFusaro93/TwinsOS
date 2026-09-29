import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

export type WOCostKind = "parts" | "labor" | "vendor";

/** One cost line (part, labor entry or vendor charge) on a work order. */
export interface WOCostLine {
  id: string;
  kind: WOCostKind;
  /** Part name, technician, or vendor. */
  label: string;
  /** Part number, labor description, or vendor description; may be empty. */
  detail: string;
  /** e.g. "3 × $12.50" or "2.5 h × $40.00/h". */
  basis: string;
  cents: number;
}

/** One work order's cost breakdown, in cents. */
export interface WOCostSummary {
  id: string;
  workOrderNumber: string;
  title: string;
  lines: WOCostLine[];
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
  work_order_number: string;
  title: string;
  asset_id: string | null;
  asset_name: string | null;
  wo_type: string | null;
  pm_schedule_id: string | null;
  created_at: string;
  completed_at: string | null;
  wo_parts: { id: string; part_name: string; part_number: string; quantity: number; unit_cost: number; deleted_at: string | null }[] | null;
  wo_labor_entries: { id: string; technician_name: string; description: string; hours: number; hourly_rate: number; deleted_at: string | null }[] | null;
  wo_vendor_charges: { id: string; vendor_name: string; description: string; cost: number; deleted_at: string | null }[] | null;
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
            "id, work_order_number, title, asset_id, asset_name, wo_type, pm_schedule_id, created_at, completed_at, wo_parts(id, part_name, part_number, quantity, unit_cost, deleted_at), wo_labor_entries(id, technician_name, description, hours, hourly_rate, deleted_at), wo_vendor_charges(id, vendor_name, description, cost, deleted_at)"
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
      return rows.map<WOCostSummary>((r) => {
        const lines: WOCostLine[] = [
          ...(r.wo_parts ?? []).filter((p) => !p.deleted_at).map<WOCostLine>((p) => ({
            id: p.id,
            kind: "parts",
            label: p.part_name,
            detail: p.part_number,
            basis: `${p.quantity} × ${formatCurrency(p.unit_cost)}`,
            cents: p.quantity * p.unit_cost,
          })),
          ...(r.wo_labor_entries ?? []).filter((l) => !l.deleted_at).map<WOCostLine>((l) => ({
            id: l.id,
            kind: "labor",
            label: l.technician_name,
            detail: l.description,
            basis: `${l.hours} h × ${formatCurrency(l.hourly_rate)}/h`,
            cents: Math.round(l.hours * l.hourly_rate),
          })),
          ...(r.wo_vendor_charges ?? []).filter((c) => !c.deleted_at).map<WOCostLine>((c) => ({
            id: c.id,
            kind: "vendor",
            label: c.vendor_name,
            detail: c.description,
            basis: "",
            cents: c.cost,
          })),
        ];
        const sum = (kind: WOCostKind) => lines.filter((l) => l.kind === kind).reduce((t, l) => t + l.cents, 0);
        return {
          id: r.id,
          workOrderNumber: r.work_order_number,
          title: r.title,
          lines,
          assetId: r.asset_id,
          assetName: r.asset_name,
          isPreventive: r.wo_type === "preventive" || r.pm_schedule_id !== null,
          costAt: r.completed_at ?? r.created_at,
          partsCents: sum("parts"),
          laborCents: sum("labor"),
          vendorCents: sum("vendor"),
        };
      });
    },
  });
}
