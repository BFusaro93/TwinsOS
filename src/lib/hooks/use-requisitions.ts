import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapRequisition } from "@/lib/supabase/mappers";
import type { ApprovalStatus, LineItem, Requisition } from "@/types";

export function patchReqCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Requisition>) {
  queryClient.setQueryData<Requisition[]>(["requisitions"], (old) =>
    old?.map((r) => r.id === id ? { ...r, ...patch } : r) ?? []
  );
}

const REQ_SELECT = "*, requisition_line_items (*)";

export function useRequisitions() {
  return useQuery({
    queryKey: ["requisitions"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("requisitions")
        .select(REQ_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapRequisition);
    },
  });
}

export function useRequisition(id: string) {
  return useQuery({
    queryKey: ["requisitions", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("requisitions")
        .select(REQ_SELECT)
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapRequisition(data);
    },
    enabled: !!id,
  });
}

export function useCreateRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      vendorId?: string | null;
      vendorName?: string | null;
      lineItems: LineItem[];
      subtotal: number;
      taxRatePercent: number;
      salesTax: number;
      shippingCost: number;
      grandTotal: number;
      notes?: string | null;
      workOrderId?: string | null;
    }) => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      const requestedByName = user?.user_metadata?.name ?? user?.email ?? "Unknown";
      const requisitionNumber = `REQ-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;

      const { data: req, error: reqErr } = await supabase
        .from("requisitions")
        .insert({
          requisition_number: requisitionNumber,
          title: input.title,
          requested_by_id: user?.id ?? null,
          requested_by_name: requestedByName,
          vendor_id: input.vendorId ?? null,
          vendor_name: input.vendorName ?? null,
          subtotal: input.subtotal,
          tax_rate_percent: input.taxRatePercent,
          sales_tax: input.salesTax,
          shipping_cost: input.shippingCost,
          grand_total: input.grandTotal,
          notes: input.notes ?? null,
          work_order_id: input.workOrderId ?? null,
        })
        .select()
        .single();
      if (reqErr) throw reqErr;

      if (input.lineItems.length > 0) {
        const { error: lineErr } = await supabase
          .from("requisition_line_items")
          .insert(
            input.lineItems.map((li) => ({
              requisition_id: req.id,
              product_item_id: li.productItemId || null,
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
        .from("requisitions")
        .select(REQ_SELECT)
        .eq("id", req.id)
        .single();
      if (fetchErr) throw fetchErr;
      return mapRequisition(full);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
    },
  });
}

/** Inserts a single line item into an existing requisition and recalculates totals. */
export function useAddRequisitionLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requisitionId,
      lineItem,
      newSubtotal,
      newSalesTax,
      newGrandTotal,
    }: {
      requisitionId: string;
      lineItem: Omit<LineItem, "id">;
      newSubtotal: number;
      newSalesTax: number;
      newGrandTotal: number;
    }) => {
      const supabase = createClient();
      const { error: lineErr } = await supabase.from("requisition_line_items").insert({
        requisition_id: requisitionId,
        product_item_id: lineItem.productItemId || null,
        product_item_name: lineItem.productItemName,
        part_number: lineItem.partNumber,
        quantity: lineItem.quantity,
        unit_cost: lineItem.unitCost,
        total_cost: lineItem.totalCost,
        project_id: lineItem.projectId ?? null,
        notes: lineItem.notes ?? null,
      });
      if (lineErr) throw lineErr;
      const { error: reqErr } = await supabase
        .from("requisitions")
        .update({ subtotal: newSubtotal, sales_tax: newSalesTax, grand_total: newGrandTotal })
        .eq("id", requisitionId);
      if (reqErr) throw reqErr;
    },
    onSuccess: (_, { requisitionId }) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["requisitions", requisitionId] });
    },
  });
}

export function useUpdateRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      title,
      vendorId,
      vendorName,
      taxRatePercent,
      shippingCost,
      salesTax,
      grandTotal,
      notes,
    }: {
      id: string;
      title: string;
      vendorId: string | null;
      vendorName: string | null;
      taxRatePercent: number;
      shippingCost: number;
      salesTax: number;
      grandTotal: number;
      notes: string | null;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("requisitions")
        .update({
          title,
          vendor_id: vendorId,
          vendor_name: vendorName,
          tax_rate_percent: taxRatePercent,
          shipping_cost: shippingCost,
          sales_tax: salesTax,
          grand_total: grandTotal,
          notes,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["requisitions", id] });
    },
  });
}

/**
 * Bulk-inserts requisitions from a CSV import (header-level only, no line items).
 * Rows missing `title` are silently skipped.
 */
export function useBulkImportRequisitions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const requestedByName = user?.user_metadata?.name ?? user?.email ?? "Unknown";

      const inserts = rows
        .filter((r) => r.title?.trim())
        .map((r) => ({
          title: r.title.trim(),
          requisition_number: r.requisitionNumber?.trim() || `REQ-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
          requested_by_id: user?.id ?? null,
          requested_by_name: requestedByName,
          vendor_name: r.vendorName?.trim() || null,
          notes: r.notes?.trim() || null,
          subtotal: 0,
          tax_rate_percent: 0,
          sales_tax: 0,
          shipping_cost: 0,
          grand_total: 0,
        }));
      if (inserts.length === 0) return 0;
      const { error } = await supabase.from("requisitions").insert(inserts);
      if (error) throw error;
      return inserts.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requisitions"] }),
  });
}

export function useUpdateRequisitionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      convertedPoId,
    }: {
      id: string;
      status: ApprovalStatus;
      convertedPoId?: string | null;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("requisitions")
        .update({
          status,
          ...(convertedPoId !== undefined && { converted_po_id: convertedPoId }),
        })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["requisitions"] });
      const previous = queryClient.getQueryData<Requisition[]>(["requisitions"]);
      patchReqCache(queryClient, id, { status });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Requisition[]>(["requisitions"], context.previous);
      }
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["requisitions", id] });
    },
  });
}

export function useDeleteRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("requisitions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requisitions"] }),
  });
}
