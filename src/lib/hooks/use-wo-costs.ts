import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapWOPart, mapWOLaborEntry, mapWOVendorCharge } from "@/lib/supabase/mappers";
import type { WOPart, WOLaborEntry, WOVendorCharge } from "@/types/cmms";

// ── Part → Open WO Assignments ───────────────────────────────────────────────

/**
 * Returns the total quantity of a given part assigned to open work orders.
 */
export function usePartOpenWOQty(partId: string) {
  return useQuery({
    queryKey: ["part-wo-qty", partId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wo_parts")
        .select("quantity, work_order_id, work_orders!inner(status)")
        .eq("part_id", partId)
        .is("deleted_at", null)
        .in("work_orders.status", ["open", "in_progress", "on_hold"]);
      if (error) {
        // Fallback: if the join fails, fetch without status filter
        const { data: fallback, error: fallbackErr } = await supabase
          .from("wo_parts")
          .select("quantity")
          .eq("part_id", partId)
          .is("deleted_at", null);
        if (fallbackErr) throw fallbackErr;
        return (fallback ?? []).reduce((sum, r) => sum + (r.quantity as number), 0);
      }
      return (data ?? []).reduce((sum, r) => sum + (r.quantity as number), 0);
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
      const { data, error } = await supabase
        .from("wo_parts")
        .select("*")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null);
      if (error) throw error;
      return data.map(mapWOPart);
    },
    enabled: !!workOrderId,
  });
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
      const { data, error } = await supabase
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("adjust_part_quantity", {
          p_part_id: input.partId,
          p_delta: -input.quantity,
        });
      }

      return mapWOPart(data);
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
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
      const { data: existing } = await supabase
        .from("wo_parts")
        .select("quantity, part_id")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("wo_parts")
        .update({ quantity, unit_cost: unitCost })
        .eq("id", id);
      if (error) throw error;

      // Adjust inventory by the delta (positive = used more, negative = used less)
      if (existing?.part_id) {
        const delta = existing.quantity - quantity; // restore old, deduct new
        if (delta !== 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("adjust_part_quantity", {
            p_part_id: existing.part_id,
            p_delta: delta,
          });
        }
      }
    },
    onSuccess: (_, { workOrderId }) => {
      queryClient.invalidateQueries({ queryKey: ["wo-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
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
      const { error } = await supabase
        .from("wo_parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;

      // Restore inventory when a part is removed from a WO
      if (partId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.rpc as any)("adjust_part_quantity", {
          p_part_id: partId,
          p_delta: quantity,
        });
      }

      return workOrderId;
    },
    onSuccess: (workOrderId) => {
      queryClient.invalidateQueries({ queryKey: ["wo-parts", workOrderId] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

// ── WO Labor ──────────────────────────────────────────────────────────────────

export function useWOLabor(workOrderId: string) {
  return useQuery({
    queryKey: ["wo-labor", workOrderId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("wo_labor_entries")
        .select("*")
        .eq("work_order_id", workOrderId)
        .is("deleted_at", null);
      if (error) throw error;
      return data.map(mapWOLaborEntry);
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
      const { data, error } = await supabase
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
      const { error } = await supabase
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
      const { error } = await supabase
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
      return data.map(mapWOVendorCharge);
    },
    enabled: !!workOrderId,
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
