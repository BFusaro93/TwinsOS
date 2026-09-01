import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProductItem } from "@/lib/supabase/mappers";
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
        .select("org_id")
        .eq("id", receipt.productId)
        .single();
      if (fetchErr) throw fetchErr;

      // The cost-layer append and WAC/FIFO recompute happen inside the RPC,
      // under the same row lock as this read, so two concurrent receipts of
      // the same product don't race on a stale JS-side read (see the RPC
      // migration for the corruption this previously caused).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase.rpc as any)("receive_product_cost_layer", {
        p_org_id: current.org_id as string,
        p_product_id: receipt.productId,
        p_layer_quantity: receipt.quantity,
        p_layer_unit_cost: Math.round(receipt.unitCost),
        p_received_at: receipt.receivedAt,
        p_po_number: receipt.poNumber ?? "",
        p_cost_method: costMethod,
      });
      if (updateErr) throw updateErr;

      // quantity_on_hand goes through the atomic adjust RPC (row-locked,
      // DB-side add) rather than a JS read-modify-write — two people
      // receiving the same product concurrently would otherwise race and
      // lose one increment (last write wins on a value read before the
      // other's write landed).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: qtyErr } = await (supabase.rpc as any)("adjust_product_item_quantity", {
        p_org_id: current.org_id,
        p_product_id: receipt.productId,
        p_delta: receipt.quantity,
        p_reason: `received via PO${receipt.poNumber ? ` ${receipt.poNumber}` : ""}`,
      });
      if (qtyErr) throw qtyErr;
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
      const { data: { user } } = await supabase.auth.getUser();
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
          track_chemicals: input.trackChemicals ?? false,
          scientific_name: input.scientificName ?? null,
          epa_registration_number: input.epaRegistrationNumber ?? null,
          epa_url: input.epaUrl ?? null,
          label_instructions: input.labelInstructions ?? null,
          route_sheet_instructions: input.routeSheetInstructions ?? null,
          active_ingredients: (input.activeIngredients ?? []) as unknown as import("@/types/supabase").Json,
          re_entry_interval: input.reEntryInterval ?? null,
          restricted_product: input.restrictedProduct ?? false,
          created_by: user?.id ?? null,
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
          created_by: user?.id ?? null,
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
          ...(input.trackChemicals !== undefined && { track_chemicals: input.trackChemicals }),
          ...(input.scientificName !== undefined && { scientific_name: input.scientificName }),
          ...(input.epaRegistrationNumber !== undefined && { epa_registration_number: input.epaRegistrationNumber }),
          ...(input.epaUrl !== undefined && { epa_url: input.epaUrl }),
          ...(input.labelInstructions !== undefined && { label_instructions: input.labelInstructions }),
          ...(input.routeSheetInstructions !== undefined && { route_sheet_instructions: input.routeSheetInstructions }),
          ...(input.activeIngredients !== undefined && { active_ingredients: input.activeIngredients as unknown as import("@/types/supabase").Json }),
          ...(input.reEntryInterval !== undefined && { re_entry_interval: input.reEntryInterval }),
          ...(input.restrictedProduct !== undefined && { restricted_product: input.restrictedProduct }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Sync relevant fields to the linked Part record (if maintenance_part)
      const syncFields: Record<string, unknown> = {};
      if (input.name !== undefined) syncFields.name = input.name;
      if (input.partNumber !== undefined) syncFields.part_number = input.partNumber;
      if (input.description !== undefined) syncFields.description = input.description;
      if (input.unitCost !== undefined) syncFields.unit_cost = input.unitCost;
      if (input.quantityOnHand !== undefined) syncFields.quantity_on_hand = input.quantityOnHand;
      if (input.minimumStock !== undefined) syncFields.minimum_stock = input.minimumStock;
      if (input.partCategory !== undefined) syncFields.category = input.partCategory;
      if (input.pictureUrl !== undefined) syncFields.picture_url = input.pictureUrl;
      if (input.vendorId !== undefined) syncFields.vendor_id = input.vendorId || null;
      if (input.vendorName !== undefined) syncFields.vendor_name = input.vendorName;
      if (input.alternateVendors !== undefined) syncFields.alternate_vendors = input.alternateVendors;
      if (input.isInventory !== undefined) syncFields.is_inventory = input.isInventory;
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

/**
 * Manual quantity_on_hand adjustment (the QtyAdjustControl stepper on
 * ProductDetailSheet) — requires a reason, folded into the audit entry via
 * adjust_product_item_quantity() (20260808000000), which already supported
 * a reason param but wasn't wired up to any UI path until now.
 */
export function useAdjustProductQuantityManual() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; orgId: string; quantityOnHand: number; reason: string }) => {
      const supabase = createClient();
      const { data: product, error: fetchErr } = await supabase
        .from("product_items")
        .select("quantity_on_hand")
        .eq("id", input.id)
        .single();
      if (fetchErr) throw fetchErr;

      const delta = input.quantityOnHand - Number(product.quantity_on_hand);
      if (delta === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("adjust_product_item_quantity", {
        p_org_id: input.orgId,
        p_product_id: input.id,
        p_delta: delta,
        p_reason: input.reason,
      });
      if (error) throw error;

      await supabase
        .from("parts")
        .update({ quantity_on_hand: input.quantityOnHand })
        .eq("product_item_id", input.id)
        .is("deleted_at", null);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["products", id] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
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
        const { data: created, error } = await supabase
          .from("product_items")
          .insert({ ...row, created_by: user?.id ?? null })
          .select()
          .single();
        let productId: string | undefined = created?.id;

        if (error?.code === "23505" && row.part_number) {
          // Duplicate part_number — update the existing record instead
          const { data: updated } = await supabase.from("product_items").update({
            name: row.name,
            description: row.description,
            category: row.category,
            unit_cost: row.unit_cost,
            price: row.price,
            vendor_name: row.vendor_name,
            is_inventory: row.is_inventory,
            quantity_on_hand: row.quantity_on_hand,
          }).eq("part_number", row.part_number).eq("org_id", profile!.org_id).is("deleted_at", null)
            .select()
            .single();
          productId = updated?.id;
        } else if (error) {
          throw error;
        }

        // Mirror maintenance_part rows into CMMS parts inventory — matches
        // useCreateProduct's mirroring so a bulk-imported maintenance part
        // shows up in Parts, not just Products.
        if (row.category === "maintenance_part" && productId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingPart } = await (supabase as any)
            .from("parts")
            .select("id")
            .eq("product_item_id", productId)
            .maybeSingle();

          if (existingPart) {
            await supabase.from("parts").update({
              name: row.name,
              part_number: row.part_number || "",
              description: row.description || "",
              unit_cost: row.unit_cost,
              quantity_on_hand: row.quantity_on_hand,
              vendor_name: row.vendor_name || "",
              is_inventory: row.is_inventory,
            }).eq("id", existingPart.id);
          } else {
            await supabase.from("parts").insert({
              name: row.name,
              part_number: row.part_number || "",
              description: row.description || "",
              category: "maintenance_part",
              unit_cost: row.unit_cost,
              quantity_on_hand: row.quantity_on_hand,
              minimum_stock: 0,
              vendor_name: row.vendor_name || "",
              product_item_id: productId,
              is_inventory: row.is_inventory,
              created_by: user?.id ?? null,
            });
          }
        }

        inserted++;
      }
      return { inserted, skipped };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
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
