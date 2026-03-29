import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPart } from "@/lib/supabase/mappers";
import { addCostLayer, computeNewUnitCost } from "@/lib/cost-methods";
import { setParts } from "@/lib/hooks/cost-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { Part } from "@/types/cmms";

export function useParts() {
  return useQuery({
    queryKey: ["parts"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      const parts = data.map(mapPart);
      setParts(parts);
      return parts;
    },
  });
}

export function usePart(id: string) {
  return useQuery({
    queryKey: ["parts", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("parts")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapPart(data);
    },
    enabled: !!id,
  });
}

export function useCreatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<Part, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">
    ) => {
      const supabase = createClient();
      const vendor = input.vendorId
        ? { vendor_id: input.vendorId, vendor_name: input.vendorName }
        : { vendor_id: null, vendor_name: null };
      const { data, error } = await supabase
        .from("parts")
        .insert({
          name: input.name,
          part_number: input.partNumber,
          description: input.description,
          category: input.category,
          quantity_on_hand: input.quantityOnHand,
          minimum_stock: input.minimumStock,
          unit_cost: input.unitCost,
          ...vendor,
          alternate_vendors: input.alternateVendors as unknown as import("@/types/supabase").Json,
          parent_part_id: input.parentPartId,
          is_inventory: input.isInventory,
          picture_url: input.pictureUrl,
          product_item_id: input.productItemId,
          cost_layers: input.costLayers as unknown as import("@/types/supabase").Json,
        })
        .select()
        .single();
      if (error) throw error;
      const part = mapPart(data);

      // If this is a standalone part (no existing product link), auto-create a
      // matching product_items entry so it appears in the PO product catalog.
      if (!input.productItemId) {
        const { data: product } = await supabase
          .from("product_items")
          .insert({
            name: input.name,
            part_number: input.partNumber || "",
            description: input.description || "",
            category: "maintenance_part",
            unit_cost: input.unitCost,
            price: input.unitCost,
            vendor_id: input.vendorId || null,
            vendor_name: input.vendorName || "",
            alternate_vendors: [] as unknown as import("@/types/supabase").Json,
            is_inventory: input.isInventory,
            quantity_on_hand: input.quantityOnHand,
            minimum_stock: input.minimumStock,
            part_category: input.category || null,
            cost_layers: [] as unknown as import("@/types/supabase").Json,
          })
          .select("id")
          .single();

        if (product) {
          await supabase
            .from("parts")
            .update({ product_item_id: product.id })
            .eq("id", part.id);
          return { ...part, productItemId: product.id };
        }
      }

      return part;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdatePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Part> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("parts")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.partNumber !== undefined && { part_number: input.partNumber }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.quantityOnHand !== undefined && { quantity_on_hand: input.quantityOnHand }),
          ...(input.minimumStock !== undefined && { minimum_stock: input.minimumStock }),
          ...(input.unitCost !== undefined && { unit_cost: input.unitCost }),
          ...(input.vendorId !== undefined && { vendor_id: input.vendorId }),
          ...(input.vendorName !== undefined && { vendor_name: input.vendorName }),
          ...(input.parentPartId !== undefined && { parent_part_id: input.parentPartId }),
          ...(input.isInventory !== undefined && { is_inventory: input.isInventory }),
          ...(input.pictureUrl !== undefined && { picture_url: input.pictureUrl }),
          ...(input.alternateVendors !== undefined && { alternate_vendors: input.alternateVendors as unknown as import("@/types/supabase").Json }),
          ...(input.location !== undefined && { location: input.location }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Sync pictureUrl to the linked product if it was updated
      if (input.pictureUrl !== undefined && data.product_item_id) {
        await supabase
          .from("product_items")
          .update({ picture_url: input.pictureUrl })
          .eq("id", data.product_item_id);
      }

      return mapPart(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["parts", id] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeletePart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("parts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

/**
 * Called on goods receipt for maintenance_part line items.
 * Appends a cost layer and — when WAC is active — updates unitCost.
 * Never touches historical PO or WO line item costs.
 */
export function useReceivePartCostLayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (receipt: {
      partId: string;
      quantity: number;
      unitCost: number; // cents — from PO line item at time of receipt
      receivedAt: string;
      poNumber?: string;
    }) => {
      const supabase = createClient();
      const { costMethod } = useSettingsStore.getState();

      const { data: current, error: fetchErr } = await supabase
        .from("parts")
        .select("cost_layers, unit_cost, quantity_on_hand")
        .eq("id", receipt.partId)
        .single();
      if (fetchErr) throw fetchErr;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentLayers = (current.cost_layers as any[]) ?? [];
      const newLayers = addCostLayer(currentLayers, {
        quantity: receipt.quantity,
        unitCost: receipt.unitCost,
        receivedAt: receipt.receivedAt,
        poNumber: receipt.poNumber,
      });
      const newUnitCost = computeNewUnitCost(newLayers, costMethod, current.unit_cost);

      const { error: updateErr } = await supabase
        .from("parts")
        .update({
          cost_layers: newLayers as unknown as import("@/types/supabase").Json,
          unit_cost: newUnitCost,
          quantity_on_hand: current.quantity_on_hand + receipt.quantity,
        })
        .eq("id", receipt.partId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

/**
 * Bulk-inserts parts from a CSV import.
 * Rows missing `name` or `partNumber` are silently skipped.
 * `unitCost` is expected as a dollar decimal string (e.g. "12.50") and is
 * stored as cents. Returns the count of rows actually inserted.
 */
export function useBulkImportParts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const inserts = rows
        .filter((r) => r.name?.trim() && r.partNumber?.trim())
        .map((r) => {
          const qoh = parseInt(r.quantityOnHand) || 0;
          const minStock = parseInt(r.minimumStock) || 0;
          return {
            name: r.name.trim(),
            part_number: r.partNumber.trim(),
            description: r.description?.trim() || "",
            category: r.category?.trim() || "mechanical",
            unit_cost: r.unitCost ? Math.round(parseFloat(r.unitCost) * 100) : 0,
            quantity_on_hand: qoh,
            minimum_stock: minStock,
            vendor_name: r.vendorName?.trim() || null,
            location: r.location?.trim() || null,
            is_inventory: qoh > 0 || minStock > 0,
            cost_layers: [] as unknown as import("@/types/supabase").Json,
            alternate_vendors: [] as unknown as import("@/types/supabase").Json,
          };
        });
      if (inserts.length === 0) return 0;
      const { error } = await supabase.from("parts").upsert(inserts, { onConflict: "org_id,part_number" });
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["parts"] }),
  });
}

/** Bulk-updates unitCost for multiple parts at once. */
export function useBulkUpdateParts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; unitCost: number }[]) => {
      const supabase = createClient();
      await Promise.all(
        updates.map(({ id, unitCost }) =>
          supabase.from("parts").update({ unit_cost: unitCost }).eq("id", id)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}
