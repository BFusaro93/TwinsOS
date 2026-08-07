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
      const { data: { user } } = await supabase.auth.getUser();
      const vendor = input.vendorId
        ? { vendor_id: input.vendorId, vendor_name: input.vendorName }
        : { vendor_id: null, vendor_name: null };
      const { data, error } = await supabase
        .from("parts")
        .insert({
          name: input.name,
          part_number: input.partNumber,
          description: input.description,
          categories: input.categories ?? (input.category ? [input.category] : []),
          category: input.categories?.[0] ?? input.category,
          quantity_on_hand: input.quantityOnHand,
          minimum_stock: input.minimumStock,
          unit_cost: input.unitCost,
          ...vendor,
          alternate_vendors: input.alternateVendors as unknown as import("@/types/supabase").Json,
          parent_part_id: input.parentPartId,
          is_inventory: input.isInventory,
          location: input.location ?? null,
          picture_url: input.pictureUrl,
          product_item_id: input.productItemId,
          cost_layers: input.costLayers as unknown as import("@/types/supabase").Json,
          created_by: user?.id ?? null,
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
            created_by: user?.id ?? null,
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
    onError: (error: unknown) => {
      import("sonner").then(({ toast }) => {
        const code = (error as { code?: string }).code;
        const msg = code === "23505"
          ? "A part with that part number already exists."
          : "Failed to create part. Please try again.";
        toast.error("Create failed", { description: msg });
      });
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
          ...(input.categories !== undefined && { categories: input.categories, category: input.categories[0] ?? "" }),
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

      // Sync changed fields to the linked product_items record
      if (data.product_item_id) {
        const productSync: Record<string, unknown> = {};
        if (input.name !== undefined) productSync.name = input.name;
        if (input.partNumber !== undefined) productSync.part_number = input.partNumber;
        if (input.description !== undefined) productSync.description = input.description;
        if (input.unitCost !== undefined) productSync.unit_cost = input.unitCost;
        if (input.quantityOnHand !== undefined) productSync.quantity_on_hand = input.quantityOnHand;
        if (input.minimumStock !== undefined) productSync.minimum_stock = input.minimumStock;
        if (input.pictureUrl !== undefined) productSync.picture_url = input.pictureUrl;
        if (input.vendorId !== undefined) productSync.vendor_id = input.vendorId || null;
        if (input.vendorName !== undefined) productSync.vendor_name = input.vendorName;
        if (input.alternateVendors !== undefined) productSync.alternate_vendors = input.alternateVendors;
        if (Object.keys(productSync).length > 0) {
          await supabase
            .from("product_items")
            .update(productSync)
            .eq("id", data.product_item_id);
        }
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
        .select("org_id, cost_layers, unit_cost, quantity_on_hand")
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

      // Goes through an RPC (rather than a plain update) so the quantity
      // change is attributed in the audit trail to this PO/receipt instead
      // of showing up as a generic manual "quantity adjusted" edit.
      const { error: updateErr } = await supabase.rpc("receive_part_quantity", {
        p_org_id: current.org_id as string,
        p_part_id: receipt.partId,
        p_quantity: Math.round(receipt.quantity),
        p_new_unit_cost: newUnitCost,
        p_new_cost_layers: newLayers as unknown as import("@/types/supabase").Json,
        p_po_number: receipt.poNumber ?? "",
      });
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
            categories: [r.category?.trim() || "mechanical"],
            unit_cost: r.unitCost ? Math.round(parseFloat(r.unitCost) * 100) : 0,
            quantity_on_hand: qoh,
            minimum_stock: minStock,
            vendor_name: r.vendorName?.trim() || null,
            location: r.location?.trim() || null,
            is_inventory: r.quantityOnHand !== undefined || r.minimumStock !== undefined || r.isInventory === "true" || qoh > 0 || minStock > 0,
            cost_layers: [] as unknown as import("@/types/supabase").Json,
            alternate_vendors: [] as unknown as import("@/types/supabase").Json,
          };
        });
      if (inserts.length === 0) return 0;

      // Insert new parts one-by-one; if a part_number already exists,
      // update it instead (the partial unique index prevents bulk upsert).
      let count = 0;
      for (const row of inserts) {
        const { data: newPart, error } = await supabase
          .from("parts")
          .insert(row)
          .select("id, product_item_id")
          .single();
        if (error?.code === "23505") {
          // Duplicate — update existing record by part_number
          const { data: { user } } = await supabase.auth.getUser();
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();
          await supabase.from("parts").update({
            name: row.name,
            description: row.description,
            category: row.category,
            categories: row.categories as string[],
            unit_cost: row.unit_cost,
            quantity_on_hand: row.quantity_on_hand,
            minimum_stock: row.minimum_stock,
            vendor_name: row.vendor_name,
            location: row.location,
            is_inventory: row.is_inventory,
          }).eq("part_number", row.part_number).eq("org_id", profile!.org_id).is("deleted_at", null);
        } else if (error) {
          throw error;
        } else if (newPart && !newPart.product_item_id) {
          // Auto-create a product_items entry so this part appears in the PO catalog
          const { data: product } = await supabase
            .from("product_items")
            .insert({
              name: row.name,
              part_number: row.part_number,
              description: row.description,
              category: "maintenance_part",
              unit_cost: row.unit_cost,
              price: row.unit_cost,
              vendor_name: row.vendor_name || "",
              alternate_vendors: [] as unknown as import("@/types/supabase").Json,
              is_inventory: row.is_inventory,
              quantity_on_hand: row.quantity_on_hand,
              minimum_stock: row.minimum_stock,
              part_category: row.category || null,
              cost_layers: [] as unknown as import("@/types/supabase").Json,
            })
            .select("id")
            .single();
          if (product) {
            await supabase
              .from("parts")
              .update({ product_item_id: product.id })
              .eq("id", newPart.id);
          }
        }
        count++;
      }
      return count;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/**
 * Rewrites the stored `categories`/`category` strings on every part tagged with
 * `from`, replacing that entry with `to` (deduped). Used to merge a stray/custom
 * category label into a saved one — renaming the label in Settings does not by
 * itself touch these already-stored strings, so this is the actual data migration.
 */
export function useMergePartCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      if (from === to) return 0;
      const supabase = createClient();
      // Filtering in JS rather than with a DB-side `.contains()`/`.filter("cs", ...)`
      // predicate: the `categories` column's underlying Postgres type differs between
      // environments (text[] in prod, jsonb in at least one other), and the wire
      // syntax those operators need differs by type. Fetching and matching client-side
      // works identically either way since Supabase deserializes both to a JS array.
      const { data: rows, error } = await supabase
        .from("parts")
        .select("id, categories")
        .is("deleted_at", null);
      if (error) throw error;

      const matching = (rows ?? []).filter((row) =>
        ((row.categories as string[] | null) ?? []).includes(from)
      );

      await Promise.all(
        matching.map((row) => {
          const merged = Array.from(
            new Set((row.categories as string[]).map((c) => (c === from ? to : c)))
          );
          return supabase
            .from("parts")
            .update({ categories: merged, category: merged[0] ?? "" })
            .eq("id", row.id);
        })
      );
      return matching.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
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
