import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { mapWOPart, mapWOLaborEntry, mapWOVendorCharge } from "@/lib/supabase/mappers";
import type { WOPart, WOLaborEntry, WOVendorCharge } from "@/types/cmms";

/**
 * Calls adjust_part_quantity() and warns the user when the requested
 * deduction was clamped at 0 instead of fully applied (using more of a part
 * than is currently in stock). The RPC itself doesn't block this — WO parts
 * usage is routinely recorded before or independent of a formal receiving
 * step — but silently applying less than requested with no signal at all
 * left inventory quietly wrong with no way for the person who typed the
 * quantity to know.
 */
/**
 * Returns the authenticated user's org_id. Used to cross-check that a
 * client-supplied vendor_id/part_id actually belongs to the caller's own
 * org before it's written onto a wo_vendor_charges/wo_parts row — without
 * this, a client could pass another org's vendor/part id and have it
 * silently linked (see 20260902190000_wo_costs_cross_org_guard.sql, which
 * adds the same check as a DB-level trigger for defense-in-depth).
 */
async function getCurrentOrgId(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile?.org_id) throw new Error("Profile not found");
  return profile.org_id as string;
}

async function adjustWOPartQuantity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  partId: string,
  delta: number,
  workOrderId: string
) {
  const { data, error } = await supabase
    .rpc("adjust_part_quantity", { p_part_id: partId, p_delta: delta, p_work_order_id: workOrderId })
    .single();
  if (error) throw error;
  if (data && delta < 0 && data.applied_delta > delta) {
    const shortBy = delta - data.applied_delta;
    toast.warning(
      `Only ${data.old_qty} in stock — ${Math.abs(shortBy)} short. Quantity on hand set to 0 instead of going negative.`
    );
  }
}

// ── Part → Open WO Assignments ───────────────────────────────────────────────

/**
 * Returns the total quantity of a given part assigned to open work orders.
 */
export function usePartOpenWOQty(partId: string) {
  return useQuery({
    queryKey: ["part-wo-qty", partId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_parts")
        .select("quantity, work_order_id, work_orders!inner(status)")
        .eq("part_id", partId)
        .is("deleted_at", null)
        .in("work_orders.status", ["open", "in_progress", "on_hold"]);
      if (error) {
        // Fallback: if the join fails, fetch without status filter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: fallback, error: fallbackErr } = await (supabase as any)
          .from("wo_parts")
          .select("quantity")
          .eq("part_id", partId)
          .is("deleted_at", null);
        if (fallbackErr) throw fallbackErr;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (fallback ?? []).reduce((sum: number, r: any) => sum + (r.quantity as number), 0);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).reduce((sum: number, r: any) => sum + (r.quantity as number), 0);
    },
    enabled: !!partId,
  });
}

// ── WO Parts ──────────────────────────────────────────────────────────────────

export function useWOParts(workOrderId: string) {
  return useQuery({
    queryKey: ["wo-parts", workOrderId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_parts")
        .select("*")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data.map(mapWOPart)) as WOPart[];
    },
    enabled: !!workOrderId,
  });
}

/**
 * After adjust_part_quantity updates parts.quantity_on_hand, mirror the new
 * value to the linked product_items row so the Products page stays in sync.
 */
async function syncPartQtyToProduct(
  supabase: ReturnType<typeof createClient>,
  partId: string
) {
  const { data: part } = await supabase
    .from("parts")
    .select("quantity_on_hand, product_item_id")
    .eq("id", partId)
    .single();
  if (part?.product_item_id) {
    await supabase
      .from("product_items")
      .update({ quantity_on_hand: part.quantity_on_hand })
      .eq("id", part.product_item_id);
  }
}

/**
 * Links a part to the asset/vehicle a WO is for in `asset_parts`, so it shows
 * up as "commonly used on this asset" going forward. `asset_parts.asset_id`
 * is polymorphic (no FK) and already holds vehicle ids too when a WO is
 * vehicle-linked, so no branching on linked_entity_type is needed here.
 * No-ops if the WO isn't linked to an asset/vehicle, or the link already
 * exists; restores it if it was previously removed.
 */
async function linkPartToAssetFromWO(
  supabase: ReturnType<typeof createClient>,
  workOrderId: string,
  partId: string,
  partName: string,
  partNumber: string
) {
  const { data: wo } = await supabase
    .from("work_orders")
    .select("asset_id")
    .eq("id", workOrderId)
    .single();
  if (!wo?.asset_id) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("asset_parts")
    .select("id, deleted_at")
    .eq("asset_id", wo.asset_id)
    .eq("part_id", partId)
    .maybeSingle();

  if (!existing) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from("asset_parts").insert({
      asset_id: wo.asset_id,
      part_id: partId,
      part_name: partName,
      part_number: partNumber,
    });
  } else if (existing.deleted_at) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("asset_parts")
      .update({ deleted_at: null, part_name: partName, part_number: partNumber })
      .eq("id", existing.id);
  }
}

export function useAddWOPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workOrderId: string;
      partId: string | null;
      partName: string;
      partNumber: string;
      quantity: number;
      unitCost: number;
    }): Promise<WOPart> => {
      const supabase = createClient();

      // Cross-org FK guard: a client-supplied partId must resolve to a part
      // in the caller's own org — otherwise a WO could be charged against
      // (and its cost data mixed with) another org's part record.
      if (input.partId) {
        const orgId = await getCurrentOrgId(supabase);
        const { data: part } = await supabase
          .from("parts")
          .select("org_id")
          .eq("id", input.partId)
          .maybeSingle();
        if (!part || part.org_id !== orgId) throw new Error("Part not found");
      }

      // If this part was previously soft-deleted on this WO, restore it instead
      // of inserting a new row (avoids unique constraint collision on work_order_id+part_id).
      if (input.partId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing } = await (supabase as any)
          .from("wo_parts")
          .select("id")
          .eq("work_order_id", input.workOrderId)
          .eq("part_id", input.partId)
          .not("deleted_at", "is", null)
          .maybeSingle();

        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: restored, error: restoreErr } = await (supabase as any)
            .from("wo_parts")
            .update({
              deleted_at: null,
              quantity: input.quantity,
              unit_cost: input.unitCost,
              part_name: input.partName,
              part_number: input.partNumber,
            })
            .eq("id", existing.id)
            .select()
            .single();
          if (restoreErr) throw restoreErr;

          // Deduct from inventory when a linked part is restored onto a WO —
          // mirrors the insert path below, which the restore branch otherwise
          // bypasses entirely (was silently skipping the inventory deduction
          // and its audit_log entry).
          await adjustWOPartQuantity(supabase, input.partId, -input.quantity, input.workOrderId);
          await syncPartQtyToProduct(supabase, input.partId);
          await linkPartToAssetFromWO(supabase, input.workOrderId, input.partId, input.partName, input.partNumber);

          return mapWOPart(restored);
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_parts")
        .insert({
          work_order_id: input.workOrderId,
          part_id: input.partId || null,
          part_name: input.partName,
          part_number: input.partNumber,
          quantity: input.quantity,
          unit_cost: input.unitCost,
        })
        .select()
        .single();
      if (error) throw error;

      // Deduct from inventory when a linked part is added to a WO
      if (input.partId) {
        await adjustWOPartQuantity(supabase, input.partId, -input.quantity, input.workOrderId);
        await syncPartQtyToProduct(supabase, input.partId);
        await linkPartToAssetFromWO(supabase, input.workOrderId, input.partId, input.partName, input.partNumber);
      }

      return mapWOPart(data);
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["asset-parts"] });
    },
  });
}

export function useUpdateWOPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workOrderId,
      quantity,
      unitCost,
    }: {
      id: string;
      workOrderId: string;
      quantity: number;
      unitCost: number;
    }) => {
      const supabase = createClient();

      // Fetch old quantity and partId before updating so we can adjust inventory
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("wo_parts")
        .select("quantity, part_id")
        .eq("id", id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("wo_parts")
        .update({ quantity, unit_cost: unitCost })
        .eq("id", id);
      if (error) throw error;

      // Adjust inventory by the delta (positive = used more, negative = used less)
      if (existing?.part_id) {
        const delta = existing.quantity - quantity; // restore old, deduct new
        if (delta !== 0) {
          await adjustWOPartQuantity(supabase, existing.part_id, delta, workOrderId);
          await syncPartQtyToProduct(supabase, existing.part_id);
        }
      }
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteWOPart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workOrderId,
      partId,
      quantity,
    }: {
      id: string;
      workOrderId: string;
      partId: string | null;
      quantity: number;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("wo_parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // Restore inventory when a part is removed from a WO
      if (partId) {
        await adjustWOPartQuantity(supabase, partId, quantity, workOrderId);
        await syncPartQtyToProduct(supabase, partId);
      }

      return workOrderId;
    },
    onSuccess: (workOrderId) => {
      queryClient.invalidateQueries({ queryKey: ["wo-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

// ── WO Labor ──────────────────────────────────────────────────────────────────

export function useWOLabor(workOrderId: string) {
  return useQuery({
    queryKey: ["wo-labor", workOrderId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_labor_entries")
        .select("*")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data.map(mapWOLaborEntry)) as WOLaborEntry[];
    },
    enabled: !!workOrderId,
  });
}

export function useAddWOLabor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workOrderId: string;
      technicianName: string;
      description: string;
      hours: number;
      hourlyRate: number;
    }): Promise<WOLaborEntry> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("wo_labor_entries")
        .insert({
          work_order_id: input.workOrderId,
          technician_name: input.technicianName,
          description: input.description,
          hours: input.hours,
          hourly_rate: input.hourlyRate,
        })
        .select()
        .single();
      if (error) throw error;
      return mapWOLaborEntry(data);
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-labor", workOrderId] });
    },
  });
}

export function useUpdateWOLabor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workOrderId,
      technicianName,
      description,
      hours,
      hourlyRate,
    }: {
      id: string;
      workOrderId: string;
      technicianName: string;
      description: string;
      hours: number;
      hourlyRate: number;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("wo_labor_entries")
        .update({
          technician_name: technicianName,
          description,
          hours,
          hourly_rate: hourlyRate,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-labor", workOrderId] });
    },
  });
}

export function useDeleteWOLabor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, workOrderId }: { id: string; workOrderId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("wo_labor_entries")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return workOrderId;
    },
    onSuccess: (workOrderId) => {
      queryClient.invalidateQueries({ queryKey: ["wo-labor", workOrderId] });
    },
  });
}

// ── WO Vendor Charges ─────────────────────────────────────────────────────────

export function useWOVendorCharges(workOrderId: string) {
  return useQuery({
    queryKey: ["wo-vendors", workOrderId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wo_vendor_charges")
        .select("*")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data.map(mapWOVendorCharge)) as WOVendorCharge[];
    },
    enabled: !!workOrderId,
  });
}

/**
 * Fetches all CMMS vendor charges logged against ANY work order for a given
 * vendor — these bypass the PO flow entirely (a direct charge from a vendor
 * logged on a Work Order's Costs tab), so they never show up in
 * usePurchaseOrders(). Used by VendorDetailSheet so vendor spend/history
 * reflects both POs and this CMMS-side path instead of silently omitting it.
 */
export function useWOVendorChargesByVendor(vendorId: string) {
  return useQuery({
    queryKey: ["wo-vendors", "by-vendor", vendorId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wo_vendor_charges")
        .select("*")
        .eq("vendor_id", vendorId)
        .is("deleted_at", null);
      if (error) throw error;
      return (data.map(mapWOVendorCharge)) as WOVendorCharge[];
    },
    enabled: !!vendorId,
  });
}

export function useAddWOVendorCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workOrderId: string;
      vendorId: string | null;
      vendorName: string;
      description: string;
      cost: number;
    }): Promise<WOVendorCharge> => {
      const supabase = createClient();

      // Cross-org FK guard: a client-supplied vendorId must resolve to a
      // vendor in the caller's own org — otherwise a WO could be charged
      // against another org's vendor record.
      if (input.vendorId) {
        const orgId = await getCurrentOrgId(supabase);
        const { data: vendor } = await supabase
          .from("vendors")
          .select("org_id")
          .eq("id", input.vendorId)
          .maybeSingle();
        if (!vendor || vendor.org_id !== orgId) throw new Error("Vendor not found");
      }

      const { data, error } = await supabase
        .from("wo_vendor_charges")
        .insert({
          work_order_id: input.workOrderId,
          vendor_id: input.vendorId || null,
          vendor_name: input.vendorName,
          description: input.description,
          cost: input.cost,
        })
        .select()
        .single();
      if (error) throw error;
      return mapWOVendorCharge(data);
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-vendors", workOrderId] });
    },
  });
}

export function useUpdateWOVendorCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workOrderId,
      vendorId,
      vendorName,
      description,
      cost,
    }: {
      id: string;
      workOrderId: string;
      vendorId: string | null;
      vendorName: string;
      description: string;
      cost: number;
    }) => {
      const supabase = createClient();

      // Cross-org FK guard — see useAddWOVendorCharge.
      if (vendorId) {
        const orgId = await getCurrentOrgId(supabase);
        const { data: vendor } = await supabase
          .from("vendors")
          .select("org_id")
          .eq("id", vendorId)
          .maybeSingle();
        if (!vendor || vendor.org_id !== orgId) throw new Error("Vendor not found");
      }

      const { error } = await supabase
        .from("wo_vendor_charges")
        .update({
          vendor_id: vendorId || null,
          vendor_name: vendorName,
          description,
          cost,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-vendors", workOrderId] });
    },
  });
}

export function useDeleteWOVendorCharge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, workOrderId }: { id: string; workOrderId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("wo_vendor_charges")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return workOrderId;
    },
    onSuccess: (workOrderId) => {
      queryClient.invalidateQueries({ queryKey: ["wo-vendors", workOrderId] });
    },
  });
}
