import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProductItem } from "@/lib/supabase/mappers";
import { addCostLayer, computeNewUnitCost } from "@/lib/cost-methods";
import { setProducts } from "@/lib/hooks/cost-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { ProductItem } from "@/types";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_items")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      const products = data.map(mapProductItem);
      setProducts(products);
      return products;
    },
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_items")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapProductItem(data);
    },
    enabled: !!id,
  });
}

/**
 * Called on goods receipt for stocked_material and project_material line items.
 * Appends a cost layer and — when WAC is active — recalculates unitCost.
 */
export function useReceiveProductCostLayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (receipt: {
      productId: string;
      quantity: number;
      unitCost: number;
      receivedAt: string;
      poNumber?: string;
    }) => {
      const supabase = createClient();
      const { costMethod } = useSettingsStore.getState();

      const { data: current, error: fetchErr } = await supabase
        .from("product_items")
        .select("cost_layers, unit_cost, quantity_on_hand")
        .eq("id", receipt.productId)
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
        .from("product_items")
        .update({
          cost_layers: newLayers as unknown as import("@/types/supabase").Json,
          unit_cost: newUnitCost,
          quantity_on_hand: current.quantity_on_hand + receipt.quantity,
        })
        .eq("id", receipt.productId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Bulk-updates unitCost and price for multiple products and mirrors cost to linked parts. */
export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      updates: { id: string; unitCost: number; price: number }[]
    ) => {
      const supabase = createClient();

      await Promise.all(
        updates.map(({ id, unitCost, price }) =>
          supabase
            .from("product_items")
            .update({ unit_cost: unitCost, price })
            .eq("id", id)
        )
      );

      // Mirror unit cost to any parts linked via product_item_id
      await Promise.all(
        updates.map(({ id, unitCost }) =>
          supabase
            .from("parts")
            .update({ unit_cost: unitCost })
            .eq("product_item_id", id)
            .is("deleted_at", null)
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<ProductItem, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">
    ) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_items")
        .insert({
          name: input.name,
          description: input.description,
          part_number: input.partNumber,
          category: input.category,
          unit_cost: input.unitCost,
          price: input.price,
          vendor_id: input.vendorId || null,
          vendor_name: input.vendorName,
          alternate_vendors: input.alternateVendors as unknown as import("@/types/supabase").Json,
          is_inventory: input.isInventory,
          quantity_on_hand: input.quantityOnHand,
          picture_url: input.pictureUrl,
          cost_layers: input.costLayers as unknown as import("@/types/supabase").Json,
          minimum_stock: input.minimumStock ?? 0,
          part_category: input.partCategory ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      // If this is a maintenance part, mirror it into the CMMS parts inventory
      if (input.category === "maintenance_part") {
        await supabase.from("parts").insert({
          name: input.name,
          part_number: input.partNumber || "",
          description: input.description || "",
          category: input.partCategory || "maintenance_part",
          unit_cost: input.unitCost,
          quantity_on_hand: input.quantityOnHand,
          minimum_stock: input.minimumStock ?? 0,
          vendor_id: input.vendorId || null,
          vendor_name: input.vendorName || "",
          product_item_id: data.id,
          is_inventory: input.isInventory,
        });
      }

      return mapProductItem(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ProductItem> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("product_items")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.partNumber !== undefined && { part_number: input.partNumber }),
          ...(input.category !== undefined && { category: input.category }),
          ...(input.unitCost !== undefined && { unit_cost: input.unitCost }),
          ...(input.price !== undefined && { price: input.price }),
          ...(input.vendorId !== undefined && { vendor_id: input.vendorId || null }),
          ...(input.vendorName !== undefined && { vendor_name: input.vendorName }),
          ...(input.isInventory !== undefined && { is_inventory: input.isInventory }),
          ...(input.quantityOnHand !== undefined && { quantity_on_hand: input.quantityOnHand }),
          ...(input.pictureUrl !== undefined && { picture_url: input.pictureUrl }),
          ...(input.minimumStock !== undefined && { minimum_stock: input.minimumStock }),
          ...(input.partCategory !== undefined && { part_category: input.partCategory }),
          ...(input.alternateVendors !== undefined && { alternate_vendors: input.alternateVendors as unknown as import("@/types/supabase").Json }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Sync relevant fields to the linked Part record (if maintenance_part)
      const syncFields: Record<string, unknown> = {};
      if (input.name !== undefined) syncFields.name = input.name;
      if (input.unitCost !== undefined) syncFields.unit_cost = input.unitCost;
      if (input.quantityOnHand !== undefined) syncFields.quantity_on_hand = input.quantityOnHand;
      if (input.minimumStock !== undefined) syncFields.minimum_stock = input.minimumStock;
      if (input.partCategory !== undefined) syncFields.category = input.partCategory;
      if (input.pictureUrl !== undefined) syncFields.picture_url = input.pictureUrl;
      if (Object.keys(syncFields).length > 0) {
        await supabase
          .from("parts")
          .update(syncFields)
          .eq("product_item_id", id)
          .is("deleted_at", null);
      }

      return mapProductItem(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products", id] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

/** Normalise a raw category string from a CSV to one of the three valid slugs,
 *  accepting common variations in casing, spacing, and phrasing. Returns null
 *  if the value can't be resolved to a known category. */
function normalizeProductCategory(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["maintenance_part", "maintenance_parts", "maint_part", "maint", "part", "parts"].includes(s))
    return "maintenance_part";
  if (["stocked_material", "stocked_materials", "stocked", "stock", "material", "materials", "supply", "supplies"].includes(s))
    return "stocked_material";
  if (["project_material", "project_materials", "project", "job_material", "job_materials", "job"].includes(s))
    return "project_material";
  return null;
}

/**
 * Bulk-inserts product catalog items from a CSV import.
 * Only `name` is strictly required; `partNumber` is optional (many products have none).
 * Rows with an unrecognisable category are skipped.
 * `unitCost` is a dollar decimal string stored as cents.
 * Returns { inserted, skipped } so callers can surface an accurate count.
 */
export function useBulkImportProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();

      let skipped = 0;
      const inserts = rows
        .map((r) => {
          const name = r.name?.trim();
          const category = normalizeProductCategory(r.category ?? "");
          if (!name || !category) { skipped++; return null; }
          const qoh = parseInt(r.quantityOnHand) || 0;
          const isInventory = r.isInventory?.trim().toLowerCase() === "yes" || qoh > 0;
          return {
            name,
            part_number: r.partNumber?.trim() || "",
            description: r.description?.trim() || undefined,
            category,
            unit_cost: r.unitCost ? Math.round(parseFloat(r.unitCost) * 100) : 0,
            price: r.salePrice
              ? Math.round(parseFloat(r.salePrice) * 100)
              : r.unitCost ? Math.round(parseFloat(r.unitCost) * 100) : 0,
            vendor_name: r.vendorName?.trim() || undefined,
            is_inventory: isInventory,
            quantity_on_hand: qoh,
            cost_layers: [] as unknown as import("@/types/supabase").Json,
            alternate_vendors: [] as unknown as import("@/types/supabase").Json,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);

      if (inserts.length === 0) return { inserted: 0, skipped };

      // Insert one-by-one so we can handle duplicate part_number upserts gracefully.
      // Products without a part_number are always inserted fresh (no natural dedup key).
      let inserted = 0;
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();

      for (const row of inserts) {
        const { error } = await supabase.from("product_items").insert(row);
        if (error?.code === "23505" && row.part_number) {
          // Duplicate part_number — update the existing record instead
          await supabase.from("product_items").update({
            name: row.name,
            description: row.description,
            category: row.category,
            unit_cost: row.unit_cost,
            price: row.price,
            vendor_name: row.vendor_name,
            is_inventory: row.is_inventory,
            quantity_on_hand: row.quantity_on_hand,
          }).eq("part_number", row.part_number).eq("org_id", profile!.org_id).is("deleted_at", null);
        } else if (error) {
          throw error;
        }
        inserted++;
      }
      return { inserted, skipped };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("product_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
