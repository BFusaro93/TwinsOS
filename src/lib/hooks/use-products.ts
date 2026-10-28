import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { mapProductItem } from "@/lib/supabase/mappers";
import { setProducts } from "@/lib/hooks/cost-store";
import { useSettingsStore } from "@/stores/settings-store";
import { parseCsvDollarsToCents, type BulkImportResult } from "@/lib/csv";
import type { ProductItem } from "@/types";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const supabase = createClient();
      // Paged: PostgREST silently caps a plain select at 1000 rows, and the
      // catalog already sits near that (918 products in the largest org) —
      // past it, products would vanish from every picker, PO line and the
      // cost store with no error.
      const data = await fetchAllRows<Parameters<typeof mapProductItem>[0]>(() =>
        supabase
          .from("product_items")
          .select("*")
          .is("deleted_at", null)
          .order("name")
      );
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
 * Called on goods receipt for every PO line (the product side of a
 * maintenance_part too). One RPC (receive_product_receipt) appends the cost
 * layer, increments quantity_on_hand and — when WAC is active — recalculates
 * unitCost. (receive_product_cost_layer is the legacy layer-only RPC the
 * previous client paired with adjust_product_item_quantity; don't call it.)
 * Reverse it with correct_product_receipt (see ReceiveGoodsDialog rollback).
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
       *  exceeds what was ordered (see the 20260901150000 migration).
       *  Required since 20260930150000: the RPC refuses to add stock that
       *  no goods receipt on an ordered PO accounts for. */
      poLineItemId: string;
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
      const { error: updateErr } = await (supabase.rpc as any)("receive_product_receipt", {
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
        p_po_line_item_id: receipt.poLineItemId,
      });
      if (updateErr) throw updateErr;
      // quantity_on_hand is incremented by the same RPC, under the same row
      // lock as the layer append (receive_product_receipt, 20260930150000).
      // Do NOT follow this with
      // adjust_product_item_quantity(+Q): that RPC appends its own cost layer
      // for positive deltas, so the pair wrote 2×Q of layers per receipt.
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

      // Supabase reports failures as { error } rather than rejecting, so an
      // unchecked Promise.all told the user "saved" when writes were refused.
      const productResults = await Promise.all(
        updates.map(({ id, unitCost, price }) =>
          supabase
            .from("product_items")
            .update({ unit_cost: unitCost, price })
            .eq("id", id)
        )
      );
      const productFailed = productResults.find((r) => r.error);
      if (productFailed?.error) throw productFailed.error;

      // Mirror unit cost to any parts linked via product_item_id
      const partResults = await Promise.all(
        updates.map(({ id, unitCost }) =>
          supabase
            .from("parts")
            .update({ unit_cost: unitCost })
            .eq("product_item_id", id)
            .is("deleted_at", null)
        )
      );
      const partFailed = partResults.find((r) => r.error);
      if (partFailed?.error) throw partFailed.error;
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
          is_taxable: input.isTaxable ?? true,
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
      // The category BEFORE this edit: moving a product into / out of
      // maintenance_part has to create / retire its CMMS Parts mirror (below).
      const { data: beforeRow } = input.category !== undefined
        ? await supabase.from("product_items").select("category").eq("id", id).maybeSingle()
        : { data: null };
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
          ...(input.isTaxable !== undefined && { is_taxable: input.isTaxable }),
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

      // Category moved INTO maintenance_part: the product needs its CMMS parts
      // row, or goods receiving updates the catalog stock but nothing shows in
      // Parts / on work orders. Moved OUT: retire the mirror so a live part
      // doesn't keep claiming stock for a product that is no longer a part.
      // (The public API's PATCH /products does the same.)
      const wasMaint = beforeRow?.category === "maintenance_part";
      const isMaint = data.category === "maintenance_part";
      if (beforeRow && isMaint && !wasMaint) {
        const { data: existingPart } = await supabase
          .from("parts")
          .select("id")
          .eq("product_item_id", id)
          .is("deleted_at", null)
          .maybeSingle();
        if (!existingPart) {
          // An unlinked part with the same part number is the same physical part — adopt it.
          const { data: samePart } = data.part_number
            ? await supabase
                .from("parts")
                .select("id, product_item_id")
                .eq("org_id", data.org_id)
                .eq("part_number", data.part_number)
                .is("deleted_at", null)
                .maybeSingle()
            : { data: null };
          const { error: mirrorErr } = samePart
            ? samePart.product_item_id
              ? { error: { message: `part number "${data.part_number}" already belongs to a different product` } }
              : await supabase.from("parts").update({ product_item_id: id }).eq("id", samePart.id)
            : await supabase.from("parts").insert({
                name: data.name,
                part_number: data.part_number || "",
                description: data.description || "",
                category: data.part_category || "maintenance_part",
                unit_cost: data.unit_cost,
                quantity_on_hand: Math.max(0, Math.round(Number(data.quantity_on_hand ?? 0))),
                minimum_stock: data.minimum_stock ?? 0,
                vendor_id: data.vendor_id,
                vendor_name: data.vendor_name || "",
                product_item_id: id,
                is_inventory: data.is_inventory,
              });
          if (mirrorErr) {
            toast.warning(`Product saved, but its CMMS part could not be created: ${mirrorErr.message}`);
          }
        }
      } else if (beforeRow && wasMaint && !isMaint) {
        const { error: retireErr } = await supabase
          .from("parts")
          .update({ deleted_at: new Date().toISOString(), product_item_id: null })
          .eq("product_item_id", id)
          .is("deleted_at", null);
        if (retireErr) {
          toast.warning(`Product saved, but its CMMS part could not be retired: ${retireErr.message}`);
        }
      }

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
        const { error: partSyncErr } = await supabase
          .from("parts")
          // `as never`: postgrest rejects excess properties on a dynamically-built patch.
          .update(syncFields as never)
          .eq("product_item_id", id)
          .is("deleted_at", null);
        if (partSyncErr) {
          toast.warning(`Product saved, but the linked part could not be synced: ${partSyncErr.message}`);
        }
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

      const { error: partMirrorErr } = await supabase
        .from("parts")
        .update({ quantity_on_hand: input.quantityOnHand })
        .eq("product_item_id", input.id)
        .is("deleted_at", null);
      if (partMirrorErr) {
        toast.warning(`Product stock updated, but the linked part's quantity could not be synced: ${partMirrorErr.message}`);
      }
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
  return parseCsvDollarsToCents(raw);
}

/** CSV "taxable" cell: yes/true/1 -> true, no/false/0 -> false, blank -> true (new-product default). */
function parseTaxableCell(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  if (!v) return true;
  return !["no", "false", "0", "n"].includes(v);
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
      const skipped: BulkImportResult["failed"] = [];

      // Rows with no part number can't be matched by the unique part_number
      // constraint, so re-importing the same file duplicated them. Match on
      // exact (case-insensitive, trimmed) name against existing live products.
      const existingNames = new Set(
        (await fetchAllRows<{ name: string }>(() =>
          supabase.from("product_items").select("name").is("deleted_at", null).order("id"),
        )).map((p) => p.name.trim().toLowerCase()),
      );

      const { data: vendorRows } = await supabase.from("vendors").select("id, name").is("deleted_at", null);
      const vendorsByName = new Map<string, { id: string; name: string } | null>();
      for (const v of vendorRows ?? []) {
        const key = v.name.trim().toLowerCase();
        vendorsByName.set(key, vendorsByName.has(key) ? null : { id: v.id, name: v.name });
      }

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

          // Quantity: blank column = "not provided" (an existing product's stock
          // must survive a cost/price-only re-import); otherwise a non-negative
          // number — fractional is legitimate for materials (numeric(10,2)),
          // not for a maintenance part (whole units).
          const qohRaw = r.quantityOnHand?.trim() ?? "";
          let qoh = 0;
          if (qohRaw !== "") {
            qoh = Number(qohRaw);
            if (!Number.isFinite(qoh) || qoh < 0) {
              failed.push({ row: rowNum, error: `"${name}": invalid quantity on hand ("${r.quantityOnHand}") — must be a number of 0 or more` });
              continue;
            }
            if (category === "maintenance_part" && !Number.isInteger(qoh)) {
              failed.push({ row: rowNum, error: `"${name}": maintenance parts are counted in whole units ("${r.quantityOnHand}")` });
              continue;
            }
            qoh = Math.round(qoh * 100) / 100;
          }
          const isInventoryCell = r.isInventory?.trim().toLowerCase() ?? "";
          const isInventory = isInventoryCell === "yes" || qoh > 0;
          // Link a CSV vendor name to the existing vendor record (unique,
          // case-insensitive match) so vendor_id and vendor_name agree.
          const csvVendor = r.vendorName?.trim() || "";
          const matchedVendor = csvVendor ? vendorsByName.get(csvVendor.toLowerCase()) ?? null : null;
          const row = {
            name,
            part_number: r.partNumber?.trim() || "",
            description: r.description?.trim() || undefined,
            category,
            unit_cost: unitCostCents ?? 0,
            price: salePriceCents ?? unitCostCents ?? 0,
            vendor_id: matchedVendor?.id ?? null,
            vendor_name: matchedVendor?.name ?? (csvVendor || undefined),
            is_inventory: isInventory,
            // Blank/omitted column -> catalog default (taxable). Only an explicit "no" opts out.
            is_taxable: parseTaxableCell(r.taxable),
            quantity_on_hand: qoh,
            cost_layers: [] as unknown as import("@/types/supabase").Json,
            alternate_vendors: [] as unknown as import("@/types/supabase").Json,
          };

          if (!row.part_number && existingNames.has(name.toLowerCase())) {
            skipped.push({ row: rowNum, error: `"${name}": a product with this name already exists (no part number to match on) — skipped` });
            continue;
          }

          const { data: created, error } = await supabase
            .from("product_items")
            .insert({ ...row, created_by: user?.id ?? null })
            .select()
            .single();
          let productId: string | undefined = created?.id;
          // Fields to carry onto the mirrored CMMS part for an EXISTING product.
          // Only what the CSV actually provided: the defaults in `row` (cost 0,
          // quantity 0, no vendor...) must never overwrite a live record.
          const providedPatch: Record<string, unknown> = {};
          let existingProduct = false;

          if (error?.code === "23505" && row.part_number) {
            // Duplicate part_number — update the existing record instead.
            existingProduct = true;
            // Only columns the CSV carries are written: a re-import that has
            // just name/part number/category/cost used to zero the product's
            // stock, reset its price to its cost, and blank its vendor.
            if (r.description?.trim()) providedPatch.description = row.description;
            if (unitCostCents !== null) providedPatch.unit_cost = row.unit_cost;
            if (salePriceCents !== null) providedPatch.price = row.price;
            if (csvVendor) {
              providedPatch.vendor_id = row.vendor_id;
              providedPatch.vendor_name = row.vendor_name;
            }
            if (isInventoryCell !== "") providedPatch.is_inventory = isInventoryCell === "yes";
            else if (qoh > 0) providedPatch.is_inventory = true;
            // Only overwrite the flag on a re-import when the CSV actually carries the column.
            if (r.taxable?.trim()) providedPatch.is_taxable = row.is_taxable;
            const { data: updated, error: updateError } = await supabase.from("product_items").update({
              name: row.name,
              category: row.category,
              ...providedPatch,
            } as never).eq("part_number", row.part_number).eq("org_id", profile!.org_id).is("deleted_at", null)
              .select()
              .single();
            if (updateError) {
              failed.push({ row: rowNum, error: `"${name}": ${updateError.message}` });
              continue;
            }
            productId = updated?.id;
            // Stock moves through the audited RPC so cost layers and the audit
            // trail follow, and only when the CSV carries a value.
            if (productId && qohRaw !== "" && Number(updated?.quantity_on_hand ?? 0) !== qoh) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: qtyErr } = await (supabase.rpc as any)("adjust_product_item_quantity", {
                p_org_id: profile!.org_id,
                p_product_id: productId,
                p_delta: qoh - Number(updated?.quantity_on_hand ?? 0),
                p_reason: "CSV import",
              });
              if (qtyErr) {
                failed.push({ row: rowNum, error: `"${name}": ${qtyErr.message}` });
                continue;
              }
            }
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
              .select("id, quantity_on_hand")
              .eq("product_item_id", productId)
              .is("deleted_at", null)
              .maybeSingle();

            if (existingPart) {
              const partPatch: Record<string, unknown> = { name: row.name, part_number: row.part_number || "" };
              if ("description" in providedPatch || !existingProduct) partPatch.description = row.description || "";
              if ("unit_cost" in providedPatch || !existingProduct) partPatch.unit_cost = row.unit_cost;
              if ("vendor_name" in providedPatch || !existingProduct) {
                partPatch.vendor_id = row.vendor_id;
                partPatch.vendor_name = row.vendor_name || "";
              }
              if ("is_inventory" in providedPatch || !existingProduct) partPatch.is_inventory = row.is_inventory;
              await supabase.from("parts").update(partPatch as never).eq("id", existingPart.id);
              if (qohRaw !== "" && existingPart.quantity_on_hand !== qoh) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: partQtyErr } = await (supabase.rpc as any)("adjust_part_quantity_manual", {
                  p_part_id: existingPart.id,
                  p_new_qty: qoh,
                  p_reason: "CSV import",
                });
                if (partQtyErr) {
                  failed.push({ row: rowNum, error: `"${name}": ${partQtyErr.message}` });
                  continue;
                }
              }
            } else {
              await supabase.from("parts").insert({
                name: row.name,
                part_number: row.part_number || "",
                description: row.description || "",
                category: "maintenance_part",
                unit_cost: row.unit_cost,
                quantity_on_hand: row.quantity_on_hand,
                minimum_stock: 0,
                vendor_id: row.vendor_id,
                vendor_name: row.vendor_name || "",
                product_item_id: productId,
                is_inventory: row.is_inventory,
                created_by: user?.id ?? null,
              });
            }
          }

          if (!row.part_number) existingNames.add(name.toLowerCase());
          succeeded++;
        } catch (err) {
          failed.push({ row: rowNum, error: err instanceof Error ? err.message : "Unknown error" });
        }
      }
      return { succeeded, failed, skipped };
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

      const deletedAt = new Date().toISOString();
      const { error } = await supabase
        .from("product_items")
        .update({ deleted_at: deletedAt })
        .eq("id", id);
      if (error) throw error;

      // A maintenance_part product is mirrored by a CMMS part (the same item).
      // Leaving that part live kept it in the Parts list AND in the PO part
      // picker, where a line now pointed at a deleted catalog product —
      // goods receiving then failed with "No catalog product found". Retire
      // the part with it (soft delete, history stays), and its asset links
      // the way removing a part does.
      const { data: retiredParts, error: partErr } = await supabase
        .from("parts")
        .update({ deleted_at: deletedAt })
        .eq("product_item_id", id)
        .is("deleted_at", null)
        .select("id");
      if (partErr) {
        toast.warning(`Product deleted, but its CMMS part could not be retired: ${partErr.message}`);
      } else if ((retiredParts ?? []).length > 0) {
        await supabase
          .from("asset_parts")
          .update({ deleted_at: deletedAt })
          .in("part_id", (retiredParts ?? []).map((p) => p.id as string))
          .is("deleted_at", null);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["asset-parts"] });
    },
  });
}
