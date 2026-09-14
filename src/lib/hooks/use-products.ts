import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProductItem } from "@/lib/supabase/mappers";
import { setProducts } from "@/lib/hooks/cost-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { BulkImportResult } from "@/lib/csv";
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
      /** PO line item this receipt is against — when given, the RPC enforces
       *  that cumulative goods_receipt_lines quantity for this line never
       *  exceeds what was ordered (see the 20260901150000 migration). */
      poLineItemId?: string;
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
        // po_line_items.unit_cost allows fractional-cent precision for case/
        // bulk pricing (e.g. $50.495/unit), but product_items.unit_cost and
        // its cost layers stay whole-cent integers — round here before it
        // hits the RPC's integer parameter.
        p_layer_unit_cost: Math.round(receipt.unitCost),
        p_received_at: receipt.receivedAt,
        p_po_number: receipt.poNumber ?? "",
        p_cost_method: costMethod,
        p_po_line_item_id: receipt.poLineItemId ?? null,
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

/**
 * Fields useUpdateProduct is never allowed to write directly. quantity_on_hand
 * must only change through the audited adjust_product_item_quantity() RPC
 * (see useAdjustProductQuantityManual / useReceiveProductCostLayer) — a plain
 * field update here would bypass the audit trail and the parts-table mirror.
 * Omitted from the input type below so passing it is a compile error; callers
 * that need to change quantity should call useAdjustProductQuantityManual.
 */
type ProductUpdateInput = Omit<Partial<ProductItem>, "quantityOnHand"> & { id: string };

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ProductUpdateInput) => {
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
/** Parses a dollar-decimal CSV cell into integer cents. Returns `null` for a
 *  blank cell (meaning "use the default"), or `NaN` if the cell has content
 *  that isn't a valid number — callers must check for NaN and treat it as a
 *  row validation failure rather than silently inserting a corrupted cost. */
function parseCentsOrNaN(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  return Math.round(parseFloat(raw) * 100);
}

export function useBulkImportProducts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]): Promise<BulkImportResult> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();

      let succeeded = 0;
      const failed: BulkImportResult["failed"] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 1;
        try {
          const name = r.name?.trim();
          const category = normalizeProductCategory(r.category ?? "");
          if (!name || !category) {
            failed.push({ row: rowNum, error: "Missing required field: Name / Category (or category not recognised)" });
            continue;
          }

          const unitCostCents = parseCentsOrNaN(r.unitCost);
          if (unitCostCents !== null && Number.isNaN(unitCostCents)) {
            failed.push({ row: rowNum, error: `"${name}": invalid unit cost ("${r.unitCost}")` });
            continue;
          }
          const salePriceCents = parseCentsOrNaN(r.salePrice);
          if (salePriceCents !== null && Number.isNaN(salePriceCents)) {
            failed.push({ row: rowNum, error: `"${name}": invalid sale price ("${r.salePrice}")` });
            continue;
          }

          const qoh = parseInt(r.quantityOnHand) || 0;
          const isInventory = r.isInventory?.trim().toLowerCase() === "yes" || qoh > 0;
          const row = {
            name,
            part_number: r.partNumber?.trim() || "",
            description: r.description?.trim() || undefined,
            category,
            unit_cost: unitCostCents ?? 0,
            price: salePriceCents ?? unitCostCents ?? 0,
            vendor_name: r.vendorName?.trim() || undefined,
            is_inventory: isInventory,
            quantity_on_hand: qoh,
            cost_layers: [] as unknown as import("@/types/supabase").Json,
            alternate_vendors: [] as unknown as import("@/types/supabase").Json,
          };

          const { data: created, error } = await supabase
            .from("product_items")
            .insert({ ...row, created_by: user?.id ?? null })
            .select()
            .single();
          let productId: string | undefined = created?.id;

          if (error?.code === "23505" && row.part_number) {
            // Duplicate part_number — update the existing record instead
            const { data: updated, error: updateError } = await supabase.from("product_items").update({
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
            if (updateError) {
              failed.push({ row: rowNum, error: `"${name}": ${updateError.message}` });
              continue;
            }
            productId = updated?.id;
          } else if (error) {
            failed.push({ row: rowNum, error: `"${name}": ${error.message}` });
            continue;
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

          succeeded++;
        } catch (err) {
          failed.push({ row: rowNum, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }
      return { succeeded, failed };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
    },
  });
}

/** Purchase Order statuses that represent a PO still in flight. Kept in sync
 *  with POStatus in src/types/purchase-order.ts. */
const OPEN_PO_STATUSES = ["requested", "pending", "approved", "ordered", "partially_fulfilled"];

/** Requisition statuses that represent a requisition still in flight — once
 *  "ordered" or "closed" it has handed off to its own PO (checked separately
 *  via OPEN_PO_STATUSES). Kept in sync with ApprovalStatus in src/types/common.ts. */
const OPEN_REQUISITION_STATUSES = ["draft", "pending_approval", "approved"];

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();

      // Every line_items row references a product_items.id (see CLAUDE.md).
      // po_line_items / requisition_line_items have no deleted_at of their
      // own — deletion happens via the parent PO/requisition — so check the
      // parent's status through a join to find still-open references.
      const [{ data: poLines, error: poErr }, { data: reqLines, error: reqErr }] = await Promise.all([
        supabase
          .from("po_line_items")
          .select("id, purchase_orders!inner(status, deleted_at)")
          .eq("product_item_id", id)
          .is("purchase_orders.deleted_at", null)
          .in("purchase_orders.status", OPEN_PO_STATUSES),
        supabase
          .from("requisition_line_items")
          .select("id, requisitions!inner(status, deleted_at)")
          .eq("product_item_id", id)
          .is("requisitions.deleted_at", null)
          .in("requisitions.status", OPEN_REQUISITION_STATUSES),
      ]);
      if (poErr) throw poErr;
      if (reqErr) throw reqErr;

      const blockers: string[] = [];
      if (poLines && poLines.length > 0) {
        blockers.push(`${poLines.length} open purchase order line item${poLines.length === 1 ? "" : "s"}`);
      }
      if (reqLines && reqLines.length > 0) {
        blockers.push(`${reqLines.length} open requisition line item${reqLines.length === 1 ? "" : "s"}`);
      }
      if (blockers.length > 0) {
        throw new Error(`Cannot delete product — it has ${blockers.join(" and ")}`);
      }

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
