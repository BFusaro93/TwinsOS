"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { recalcEstimateTotals } from "@/lib/estimate-calc";

// Equipment is an internal cost input (see 20261127000400_crm_equipment_costs.sql):
// a catalog of machines with a cost rate, snapshotted onto estimate lines. It is
// never client-facing. The new tables aren't in the generated Supabase types yet,
// so the client is cast the same way use-line-item-subitems.ts does.

export type EquipmentUnit = "hour" | "day" | "flat";

export const EQUIPMENT_UNIT_LABELS: Record<EquipmentUnit, string> = {
  hour: "per hour",
  day: "per day",
  flat: "flat",
};

/** What the company intends to recover for a machine; no charge set means no markup (charge = cost). */
export function effectiveChargeCents(rateCents: number, chargeRateCents: number | null): number {
  return chargeRateCents ?? rateCents;
}

export interface Equipment {
  id: string;
  name: string;
  description: string | null;
  rateCents: number;
  chargeRateCents: number | null;
  unit: EquipmentUnit;
  isActive: boolean;
  sortOrder: number;
}

export interface LineItemEquipment {
  id: string;
  lineItemId: string;
  equipmentId: string | null;
  name: string;
  unit: EquipmentUnit;
  qty: number;
  rateCents: number;
  chargeRateCents: number | null;
  totalCostCents: number;
  sortOrder: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEquipment(row: any): Equipment {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    rateCents: row.rate_cents,
    chargeRateCents: row.charge_rate_cents ?? null,
    unit: row.unit,
    isActive: row.is_active,
    sortOrder: row.sort_order ?? 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineEquipment(row: any): LineItemEquipment {
  return {
    id: row.id,
    lineItemId: row.line_item_id,
    equipmentId: row.equipment_id ?? null,
    name: row.name,
    unit: row.unit,
    qty: Number(row.qty),
    rateCents: row.rate_cents,
    chargeRateCents: row.charge_rate_cents ?? null,
    totalCostCents: row.total_cost_cents,
    sortOrder: row.sort_order ?? 0,
  };
}

// ── catalog ───────────────────────────────────────────────────────────────────

export function useEquipment() {
  return useQuery<Equipment[]>({
    queryKey: ["crm-equipment"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_equipment")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => mapEquipment(r));
    },
  });
}

export function useUpsertEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: {
      id?: string;
      name: string;
      description?: string | null;
      rateCents: number;
      chargeRateCents?: number | null;
      unit: EquipmentUnit;
      isActive?: boolean;
    }) => {
      const supabase = createClient();
      const row = {
        ...(item.id ? { id: item.id } : {}),
        name: item.name.trim(),
        description: item.description?.trim() || null,
        rate_cents: item.rateCents,
        charge_rate_cents: item.chargeRateCents ?? null,
        unit: item.unit,
        is_active: item.isActive ?? true,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_equipment").upsert(row, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-equipment"] }),
  });
}

export function useDeleteEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_equipment")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-equipment"] }),
  });
}

// ── equipment on an estimate line ─────────────────────────────────────────────

async function recalcParentEstimate(
  supabase: ReturnType<typeof createClient>,
  lineItemId: string,
  queryClient: ReturnType<typeof useQueryClient>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: li } = await (supabase as any)
    .from("estimate_line_items")
    .select("estimate_id")
    .eq("id", lineItemId)
    .single();
  if (!li?.estimate_id) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await recalcEstimateTotals(supabase as any, li.estimate_id);
  queryClient.invalidateQueries({ queryKey: ["estimates", "detail", li.estimate_id] });
  queryClient.invalidateQueries({ queryKey: ["estimates"] });
}

export function useLineItemEquipment(lineItemId: string) {
  return useQuery<LineItemEquipment[]>({
    queryKey: ["line-item-equipment", lineItemId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_line_item_equipment")
        .select("*")
        .eq("line_item_id", lineItemId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => mapLineEquipment(r));
    },
    enabled: !!lineItemId,
  });
}

/**
 * Total equipment cost across the given estimate lines — feeds the Asset/Equipment
 * row of the summary panel's cost breakdown. Callers pass only the lines the
 * estimate counts (not lost / draft / deleted), mirroring recalcEstimateTotals.
 */
export function useEstimateEquipmentCost(lineItemIds: string[]) {
  const key = [...lineItemIds].sort().join(",");
  return useQuery<number>({
    queryKey: ["estimate-equipment", key],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_line_item_equipment")
        .select("total_cost_cents")
        .in("line_item_id", lineItemIds)
        .is("deleted_at", null);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).reduce((sum: number, r: any) => sum + (r.total_cost_cents ?? 0), 0);
    },
    enabled: lineItemIds.length > 0,
  });
}

export interface UpsertLineEquipmentPayload {
  lineItemId: string;
  item: {
    id?: string;
    equipmentId: string | null;
    name: string;
    unit: EquipmentUnit;
    qty: number;
    rateCents: number;
    chargeRateCents?: number | null;
    sortOrder?: number;
  };
}

export function useUpsertLineEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ lineItemId, item }: UpsertLineEquipmentPayload) => {
      const supabase = createClient();
      const row = {
        ...(item.id ? { id: item.id } : {}),
        line_item_id: lineItemId,
        equipment_id: item.equipmentId,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        rate_cents: item.rateCents,
        charge_rate_cents: item.chargeRateCents ?? null,
        total_cost_cents: Math.round(item.qty * item.rateCents),
        sort_order: item.sortOrder ?? 0,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_line_item_equipment")
        .upsert(row, { onConflict: "id" });
      if (error) throw error;
    },
    onSuccess: async (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["line-item-equipment", v.lineItemId] });
      queryClient.invalidateQueries({ queryKey: ["estimate-equipment"] });
      await recalcParentEstimate(createClient(), v.lineItemId, queryClient);
    },
  });
}

export function useDeleteLineEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; lineItemId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_line_item_equipment")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["line-item-equipment", v.lineItemId] });
      queryClient.invalidateQueries({ queryKey: ["estimate-equipment"] });
      await recalcParentEstimate(createClient(), v.lineItemId, queryClient);
    },
  });
}

// ── service defaults ──────────────────────────────────────────────────────────

export interface ServiceEquipmentDefault {
  id: string;
  serviceId: string;
  equipmentId: string;
  defaultQty: number;
}

export function useServiceEquipment(serviceId: string) {
  return useQuery<ServiceEquipmentDefault[]>({
    queryKey: ["service-equipment", serviceId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_service_equipment")
        .select("id, service_id, equipment_id, default_qty")
        .eq("service_id", serviceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        serviceId: r.service_id,
        equipmentId: r.equipment_id,
        defaultQty: Number(r.default_qty),
      }));
    },
    enabled: !!serviceId,
  });
}

export function useSaveServiceEquipment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (p: { serviceId: string; id?: string; equipmentId?: string; defaultQty?: number; remove?: boolean }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const table = (supabase as any).from("crm_service_equipment");
      if (p.remove && p.id) {
        const { error } = await table.update({ deleted_at: new Date().toISOString() }).eq("id", p.id);
        if (error) throw error;
      } else if (p.id) {
        const { error } = await table.update({ default_qty: p.defaultQty }).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await table.insert({
          service_id: p.serviceId,
          equipment_id: p.equipmentId,
          default_qty: p.defaultQty ?? 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: ["service-equipment", v.serviceId] }),
  });
}

/**
 * Copies a service's default equipment onto a freshly added estimate line as
 * snapshot rows (name/unit/rate frozen from the catalog), then recalcs. A no-op
 * when the service has no defaults.
 */
export function useApplyServiceEquipmentDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, lineItemId, estimateId }: { serviceId: string; lineItemId: string; estimateId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: defaults, error } = await (supabase as any)
        .from("crm_service_equipment")
        .select("default_qty, crm_equipment!inner(id, name, unit, rate_cents, charge_rate_cents, is_active, deleted_at)")
        .eq("service_id", serviceId)
        .is("deleted_at", null)
        .is("crm_equipment.deleted_at", null)
        .eq("crm_equipment.is_active", true);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = ((defaults ?? []) as any[]).map((d, i) => {
        const qty = Number(d.default_qty);
        return {
          line_item_id: lineItemId,
          equipment_id: d.crm_equipment.id,
          name: d.crm_equipment.name,
          unit: d.crm_equipment.unit,
          qty,
          rate_cents: d.crm_equipment.rate_cents,
          charge_rate_cents: d.crm_equipment.charge_rate_cents ?? null,
          total_cost_cents: Math.round(qty * d.crm_equipment.rate_cents),
          sort_order: i,
        };
      });
      if (rows.length === 0) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insError } = await (supabase as any).from("estimate_line_item_equipment").insert(rows);
      if (insError) throw insError;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await recalcEstimateTotals(supabase as any, estimateId);
      return rows.length;
    },
    onSuccess: (_n, v) => {
      queryClient.invalidateQueries({ queryKey: ["line-item-equipment", v.lineItemId] });
      queryClient.invalidateQueries({ queryKey: ["estimate-equipment"] });
      queryClient.invalidateQueries({ queryKey: ["estimates", "detail", v.estimateId] });
    },
  });
}
