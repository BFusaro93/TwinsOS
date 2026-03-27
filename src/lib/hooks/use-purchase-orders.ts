import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPurchaseOrder } from "@/lib/supabase/mappers";
import type { PurchaseOrder, POStatus, LineItem } from "@/types";

// Helper: immediately update a PO in every cached list
function patchPOCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<PurchaseOrder>) {
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
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, status, invoiceNumber, paymentSubmittedToAP, paymentRemitted, paymentType, paymentBookedInQB }) => {
      patchPOCache(queryClient, id, {
        status,
        ...(invoiceNumber !== undefined && { invoiceNumber }),
        ...(paymentSubmittedToAP !== undefined && { paymentSubmittedToAP }),
        ...(paymentRemitted !== undefined && { paymentRemitted }),
        ...(paymentType !== undefined && { paymentType }),
        ...(paymentBookedInQB !== undefined && { paymentBookedInQB }),
      });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}
