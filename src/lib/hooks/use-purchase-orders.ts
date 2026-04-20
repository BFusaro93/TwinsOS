import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { mapPurchaseOrder } from "@/lib/supabase/mappers";
import type { PurchaseOrder, POStatus, LineItem } from "@/types";

// Helper: immediately update a PO in every cached list
export function patchPOCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<PurchaseOrder>) {
  queryClient.setQueryData<PurchaseOrder[]>(["purchase-orders"], (old) =>
    old?.map((po) => po.id === id ? { ...po, ...patch } : po) ?? []
  );
}

const PO_SELECT = "*, po_line_items (*)";

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(PO_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapPurchaseOrder);
    },
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(PO_SELECT)
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapPurchaseOrder(data);
    },
    enabled: !!id,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      po: Omit<PurchaseOrder, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">
    ) => {
      const supabase = createClient();

      const { data: created, error: poErr } = await supabase
        .from("purchase_orders")
        .insert({
          po_number: po.poNumber,
          po_date: po.poDate,
          invoice_number: po.invoiceNumber,
          status: po.status,
          vendor_id: po.vendorId || null,
          vendor_name: po.vendorName,
          subtotal: po.subtotal,
          tax_rate_percent: po.taxRatePercent,
          sales_tax: po.salesTax,
          shipping_cost: po.shippingCost,
          grand_total: po.grandTotal,
          requisition_id: po.requisitionId ?? null,
          payment_submitted_to_ap: po.paymentSubmittedToAP,
          payment_remitted: po.paymentRemitted,
          payment_type: po.paymentType,
          payment_booked_in_qb: po.paymentBookedInQB,
          notes: po.notes,
        })
        .select()
        .single();
      if (poErr) throw poErr;

      if (po.lineItems.length > 0) {
        const { error: lineErr } = await supabase
          .from("po_line_items")
          .insert(
            po.lineItems.map((li: LineItem) => ({
              po_id: created.id,
              product_item_id: li.productItemId || null,
              part_id: li.partId ?? null,
              product_item_name: li.productItemName,
              part_number: li.partNumber,
              quantity: li.quantity,
              unit_cost: li.unitCost,
              total_cost: li.totalCost,
              project_id: li.projectId ?? null,
              notes: li.notes ?? null,
            }))
          );
        if (lineErr) throw lineErr;
      }

      const { data: full, error: fetchErr } = await supabase
        .from("purchase_orders")
        .select(PO_SELECT)
        .eq("id", created.id)
        .single();
      if (fetchErr) throw fetchErr;
      return mapPurchaseOrder(full);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      vendorId,
      vendorName,
      poDate,
      paymentType,
      invoiceNumber,
      taxRatePercent,
      shippingCost,
      salesTax,
      grandTotal,
      notes,
    }: {
      id: string;
      vendorId: string | null;
      vendorName: string | null;
      poDate: string | null;
      paymentType: string | null;
      invoiceNumber: string | null;
      taxRatePercent: number;
      shippingCost: number;
      salesTax: number;
      grandTotal: number;
      notes: string | null;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          vendor_id: vendorId ?? undefined,
          vendor_name: vendorName ?? undefined,
          po_date: poDate ?? undefined,
          payment_type: paymentType ?? undefined,
          invoice_number: invoiceNumber ?? undefined,
          tax_rate_percent: taxRatePercent,
          shipping_cost: shippingCost,
          sales_tax: salesTax,
          grand_total: grandTotal,
          notes: notes ?? undefined,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}

/**
 * Bulk-inserts purchase orders from a CSV import (header-level only, no line items).
 * Rows missing `poNumber` or `vendorName` are silently skipped.
 */
/**
 * Bulk-imports POs from a CSV. Supports two formats:
 *
 * 1. **Denormalized (line-level):** Multiple rows per PO, each row is a line item.
 *    Has columns like "Purchase Order #", "Line Type" (PART / PERCENT_TAXABLE / AMOUNT_TAXABLE),
 *    "Line Name", "Part Number", "Unit Cost", "Ordered Quantity", etc.
 *    Tax and shipping are extracted from special line types.
 *
 * 2. **Flat (header-only):** One row per PO with vendorName, poDate, status, notes.
 *    No line items.
 *
 * Auto-detects format by checking for a "Line Type" or "lineType" column.
 */
export function useBulkImportPurchaseOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      if (rows.length === 0) return 0;

      // Detect format: denormalized (line-level) vs flat (header-only)
      const sample = rows[0];
      const hasLineType = "lineType" in sample || "Line Type" in sample;
      const hasPONumber = "Purchase Order #" in sample || "poNumber" in sample;

      if (hasLineType && hasPONumber) {
        return importDenormalized(supabase, rows);
      }
      return importFlat(supabase, rows);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Get a field value from a row, trying both the raw key and a camelCase alias */
function getField(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (row[k]?.trim()) return row[k].trim();
  }
  return "";
}

function parseDate(raw: string): string | null {
  if (!raw) return null;

  // Handle M/D/YY HH:MM format from QuickBooks exports (e.g. "4/9/26 14:09")
  // JavaScript's Date constructor treats 2-digit years as year 26 AD, not 2026.
  const shortYearFull = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (shortYearFull) {
    const [, mo, dy, yr, hr, mn] = shortYearFull;
    return new Date(2000 + parseInt(yr), parseInt(mo) - 1, parseInt(dy), parseInt(hr), parseInt(mn)).toISOString();
  }

  // Handle M/D/YY (date only, no time)
  const shortYearDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (shortYearDate) {
    const [, mo, dy, yr] = shortYearDate;
    return new Date(2000 + parseInt(yr), parseInt(mo) - 1, parseInt(dy)).toISOString();
  }

  // Fallback for ISO / long-year formats
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function mapStatus(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z_]/g, "");
  if (s === "completed" || s === "complete") return "completed";
  if (s === "approved") return "approved";
  if (s === "canceled" || s === "cancelled") return "canceled";
  if (s === "pending" || s === "pendingapproval") return "pending";
  if (s === "draft") return "draft";
  if (s === "ordered") return "ordered";
  return "completed";
}

type SupabaseClient = ReturnType<typeof createClient>;

async function importDenormalized(supabase: SupabaseClient, rows: Record<string, string>[]): Promise<number> {
  // Group rows by PO number
  const poGroups = new Map<string, Record<string, string>[]>();
  for (const row of rows) {
    const poNum = getField(row, "Purchase Order #", "poNumber");
    if (!poNum) continue;
    if (!poGroups.has(poNum)) poGroups.set(poNum, []);
    poGroups.get(poNum)!.push(row);
  }

  // Get existing vendors for lookup
  const { data: existingVendors = [] } = await supabase
    .from("vendors")
    .select("id, name")
    .is("deleted_at", null);
  const vendorMap = new Map((existingVendors ?? []).map((v) => [v.name.toLowerCase(), v.id as string]));

  let count = 0;
  for (const [poNum, poRows] of poGroups) {
    const headerRow = poRows[0];
    const vendorName = getField(headerRow, "Vendor", "vendorName");
    const status = mapStatus(getField(headerRow, "Status", "status"));
    const createdOn = parseDate(getField(headerRow, "Created On", "createdAt"));
    const completedOn = parseDate(getField(headerRow, "Completed On", "completedOn"));
    const approvedOn = parseDate(getField(headerRow, "Approved On", "approvedOn"));
    const dueDate = parseDate(getField(headerRow, "Due Date", "dueDate"));

    // Find or create vendor
    let vendorId: string | null = null;
    if (vendorName) {
      vendorId = vendorMap.get(vendorName.toLowerCase()) ?? null;
      if (!vendorId) {
        const { data: newVendor } = await supabase
          .from("vendors")
          .insert({ name: vendorName, is_active: true })
          .select("id")
          .single();
        if (newVendor) {
          vendorId = newVendor.id;
          vendorMap.set(vendorName.toLowerCase(), vendorId);
        }
      }
    }

    // Separate line types
    const partLines = poRows.filter((r) => getField(r, "Line Type", "lineType") === "PART");
    const taxLines = poRows.filter((r) => getField(r, "Line Type", "lineType") === "PERCENT_TAXABLE");
    const shippingLines = poRows.filter((r) => getField(r, "Line Type", "lineType") === "AMOUNT_TAXABLE");

    // Calculate totals
    const subtotalCents = partLines.reduce((sum, r) => {
      const cost = parseFloat(getField(r, "Ordered Cost", "orderedCost")) || 0;
      return sum + Math.round(cost * 100);
    }, 0);

    // Extract tax rate from tax line name, e.g., "CT Sales Tax (6.35%)"
    let taxRatePercent = 0;
    let salesTaxCents = 0;
    if (taxLines.length > 0) {
      const taxName = getField(taxLines[0], "Line Name", "lineName");
      const match = taxName.match(/(\d+\.?\d*)%/);
      if (match) taxRatePercent = parseFloat(match[1]);
      const taxCost = parseFloat(getField(taxLines[0], "Ordered Cost", "orderedCost")) || 0;
      salesTaxCents = Math.round(taxCost * 100);
    }

    // Extract shipping
    let shippingCents = 0;
    for (const sl of shippingLines) {
      const cost = parseFloat(getField(sl, "Ordered Cost", "orderedCost")) || 0;
      shippingCents += Math.round(cost * 100);
    }

    const grandTotalCents = subtotalCents + salesTaxCents + shippingCents;

    // Create the PO — derive year from the CSV's Created On date, not today
    const poYear = createdOn ? new Date(createdOn).getFullYear() : new Date().getFullYear();
    const poNumber = `PO-${poYear}-${poNum}`;
    const { data: created, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        po_number: poNumber,
        po_date: createdOn,
        vendor_id: vendorId,
        vendor_name: vendorName,
        status,
        subtotal: subtotalCents,
        tax_rate_percent: taxRatePercent,
        sales_tax: salesTaxCents,
        shipping_cost: shippingCents,
        grand_total: grandTotalCents,
      })
      .select("id")
      .single();

    if (poErr) {
      if (poErr.code === "23505") { count++; continue; } // duplicate — skip
      throw poErr;
    }

    // Create line items + product catalog entries
    for (const line of partLines) {
      const itemName = getField(line, "Line Name", "lineName");
      const partNumber = getField(line, "Part Number", "partNumber");
      const unitCostDollars = parseFloat(getField(line, "Unit Cost", "unitCost")) || 0;
      const unitCostCents = Math.round(unitCostDollars * 100);
      const quantity = parseInt(getField(line, "Ordered Quantity", "orderedQuantity")) || 1;

      // Find or create product catalog entry
      let productItemId: string | null = null;
      if (partNumber) {
        const { data: existingProduct } = await supabase
          .from("product_items")
          .select("id")
          .eq("part_number", partNumber)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();

        if (existingProduct) {
          productItemId = existingProduct.id;
        } else {
          const { data: newProduct } = await supabase
            .from("product_items")
            .insert({
              name: itemName,
              part_number: partNumber,
              description: "",
              category: "maintenance_part",
              unit_cost: unitCostCents,
              price: unitCostCents,
              vendor_id: vendorId,
              vendor_name: vendorName,
              is_inventory: false,
              alternate_vendors: [],
              cost_layers: [],
            })
            .select("id")
            .single();
          if (newProduct) productItemId = newProduct.id;
        }
      }

      // Sync to CMMS Parts inventory so the part appears in inventory and links back to this PO
      if (productItemId && partNumber) {
        const { data: linked } = await supabase
          .from("parts")
          .select("id")
          .eq("product_item_id", productItemId)
          .is("deleted_at", null)
          .maybeSingle();

        if (!linked) {
          // Check for an unlinked part with the same part number
          const { data: byPN } = await supabase
            .from("parts")
            .select("id")
            .eq("part_number", partNumber)
            .is("deleted_at", null)
            .maybeSingle();

          if (byPN) {
            // Link the existing part to the catalog entry
            await supabase
              .from("parts")
              .update({ product_item_id: productItemId })
              .eq("id", byPN.id);
          } else {
            // Create a new part record
            await supabase.from("parts").insert({
              name: itemName,
              part_number: partNumber,
              unit_cost: unitCostCents,
              product_item_id: productItemId,
              is_inventory: true,
              quantity_on_hand: 0,
              minimum_stock: 0,
              alternate_vendors: [],
              cost_layers: [],
              vendor_id: vendorId,
              vendor_name: vendorName,
            });
          }
        }
      }

      await supabase.from("po_line_items").insert({
        po_id: created.id,
        product_item_id: productItemId,
        product_item_name: itemName,
        part_number: partNumber,
        quantity,
        unit_cost: unitCostCents,
        total_cost: quantity * unitCostCents,
      });
    }

    count++;
  }
  return count;
}

async function importFlat(supabase: SupabaseClient, rows: Record<string, string>[]): Promise<number> {
  const inserts = rows
    .filter((r) => r.vendorName?.trim())
    .map((r) => ({
      po_number: r.poNumber?.trim() || `PO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
      vendor_name: r.vendorName.trim(),
      po_date: r.poDate?.trim() || null,
      invoice_number: r.invoiceNumber?.trim() || null,
      status: r.status?.trim() || "requested",
      notes: r.notes?.trim() || null,
      subtotal: 0,
      tax_rate_percent: 0,
      sales_tax: 0,
      shipping_cost: 0,
      grand_total: 0,
    }));
  if (inserts.length === 0) return 0;

  let count = 0;
  for (const row of inserts) {
    const { error } = await supabase.from("purchase_orders").insert(row);
    if (error?.code === "23505") {
      // skip duplicates
    } else if (error) {
      throw error;
    }
    count++;
  }
  return count;
}

export function useUpdatePurchaseOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      invoiceNumber,
      paymentSubmittedToAP,
      paymentRemitted,
      paymentType,
      paymentBookedInQB,
    }: {
      id: string;
      status: POStatus;
      invoiceNumber?: string | null;
      paymentSubmittedToAP?: boolean;
      paymentRemitted?: boolean;
      paymentType?: PurchaseOrder["paymentType"];
      paymentBookedInQB?: boolean;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("purchase_orders")
        .update({
          status,
          ...(invoiceNumber !== undefined && { invoice_number: invoiceNumber }),
          ...(paymentSubmittedToAP !== undefined && { payment_submitted_to_ap: paymentSubmittedToAP }),
          ...(paymentRemitted !== undefined && { payment_remitted: paymentRemitted }),
          ...(paymentType !== undefined && { payment_type: paymentType }),
          ...(paymentBookedInQB !== undefined && { payment_booked_in_qb: paymentBookedInQB }),
        })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onMutate: async ({ id, status, invoiceNumber, paymentSubmittedToAP, paymentRemitted, paymentType, paymentBookedInQB }) => {
      await queryClient.cancelQueries({ queryKey: ["purchase-orders"] });
      const previous = queryClient.getQueryData<PurchaseOrder[]>(["purchase-orders"]);
      patchPOCache(queryClient, id, {
        status,
        ...(invoiceNumber !== undefined && { invoiceNumber }),
        ...(paymentSubmittedToAP !== undefined && { paymentSubmittedToAP }),
        ...(paymentRemitted !== undefined && { paymentRemitted }),
        ...(paymentType !== undefined && { paymentType }),
        ...(paymentBookedInQB !== undefined && { paymentBookedInQB }),
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<PurchaseOrder[]>(["purchase-orders"], context.previous);
      }
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}

// ── PO Line Item mutations ────────────────────────────────────────────────────

/** Inserts a new line item row and syncs the PO totals. */
export function useAddPOLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poId,
      item,
      subtotal,
      salesTax,
      grandTotal,
    }: {
      poId: string;
      item: LineItem;
      subtotal: number;
      salesTax: number;
      grandTotal: number;
    }) => {
      const supabase = createClient();
      const [{ error: lineErr }, { error: poErr }] = await Promise.all([
        supabase.from("po_line_items").insert({
          id: item.id,          // anchor DB row to the client-generated UUID so edits
          // can target the row immediately without waiting for a refetch
          po_id: poId,
          product_item_id: item.productItemId || null,
          part_id: item.partId ?? null,
          product_item_name: item.productItemName,
          part_number: item.partNumber,
          quantity: item.quantity,
          unit_cost: item.unitCost,
          total_cost: item.totalCost,
          project_id: item.projectId ?? null,
          notes: item.notes ?? null,
        }),
        supabase.from("purchase_orders").update({ subtotal, sales_tax: salesTax, grand_total: grandTotal }).eq("id", poId),
      ]);
      if (lineErr) throw lineErr;
      if (poErr) throw poErr;
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to add line item: ${msg}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

/** Updates quantity, unit cost, and project on an existing line item, and syncs PO totals. */
export function useUpdatePOLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poId,
      item,
      subtotal,
      salesTax,
      grandTotal,
    }: {
      poId: string;
      item: LineItem;
      subtotal: number;
      salesTax: number;
      grandTotal: number;
    }) => {
      const supabase = createClient();
      const [{ data: lineData, error: lineErr }, { error: poErr }] = await Promise.all([
        supabase
          .from("po_line_items")
          .update({
            quantity: item.quantity,
            unit_cost: item.unitCost,
            total_cost: item.totalCost,
            project_id: item.projectId ?? null,
            notes: item.notes ?? null,
          })
          .eq("id", item.id)
          .select(),          // needed to detect silent 0-row updates
        supabase
          .from("purchase_orders")
          .update({ subtotal, sales_tax: salesTax, grand_total: grandTotal })
          .eq("id", poId),
      ]);
      if (lineErr) throw lineErr;
      if (poErr) throw poErr;
      // If the update silently matched 0 rows the row either doesn't exist or RLS
      // filtered it out — surface this as an explicit error so onError can roll back.
      if (!lineData || lineData.length === 0) {
        throw new Error(
          `Line item ${item.id} was not updated — it may not exist or you may not have permission.`
        );
      }
    },
    // Optimistically update the cache immediately so that:
    // 1. Any background refetch (window focus, etc.) doesn't overwrite the edit
    //    before the DB write completes.
    // 2. Navigating away and back shows the edited value from cache (not old DB data).
    // On error, roll back to the previous cache snapshot.
    onMutate: async ({ poId, item, subtotal, salesTax, grandTotal }) => {
      // Cancel any in-flight refetches so they don't overwrite the optimistic update
      await queryClient.cancelQueries({ queryKey: ["purchase-orders"] });
      const previous = queryClient.getQueryData<PurchaseOrder[]>(["purchase-orders"]);
      queryClient.setQueryData<PurchaseOrder[]>(["purchase-orders"], (old) =>
        old?.map((po) =>
          po.id === poId
            ? {
                ...po,
                subtotal,
                salesTax,
                grandTotal,
                lineItems: po.lineItems.map((li) =>
                  li.id === item.id
                    ? { ...li, quantity: item.quantity, unitCost: item.unitCost, totalCost: item.totalCost, projectId: item.projectId }
                    : li
                ),
              }
            : po
        ) ?? []
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      // Roll back the optimistic update
      if (context?.previous) {
        queryClient.setQueryData<PurchaseOrder[]>(["purchase-orders"], context.previous);
      }
      // Surface the error so the user knows the save failed
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to save line item: ${msg}`);
    },
    // Always refetch from DB after the mutation settles to confirm the true state.
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

/** Hard-deletes a line item row and syncs the PO totals. */
export function useDeletePOLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      poId,
      lineItemId,
      subtotal,
      salesTax,
      grandTotal,
    }: {
      poId: string;
      lineItemId: string;
      subtotal: number;
      salesTax: number;
      grandTotal: number;
    }) => {
      const supabase = createClient();
      const [{ error: lineErr }, { error: poErr }] = await Promise.all([
        supabase.from("po_line_items").delete().eq("id", lineItemId),
        supabase.from("purchase_orders").update({ subtotal, sales_tax: salesTax, grand_total: grandTotal }).eq("id", poId),
      ]);
      if (lineErr) throw lineErr;
      if (poErr) throw poErr;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

export function useDeletePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("purchase_orders").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}
