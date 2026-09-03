import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { mapRequisition } from "@/lib/supabase/mappers";
import { submitEntityForApproval } from "@/lib/hooks/use-approval-requests";
import type { ApprovalStatus, LineItem, Requisition } from "@/types";

/**
 * A requisition already in the approval pipeline ("pending_approval" or
 * "approved") must have its approval_requests chain re-derived whenever a
 * line-item add/edit/delete changes its grand total — otherwise editing a
 * line item after submission silently keeps whatever approvers were computed
 * against the OLD total, bypassing a threshold the new total now crosses.
 * Called after every line-item mutation below; a no-op for requisitions not
 * currently in the pipeline (draft, rejected, ordered, etc).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resubmitReqForApprovalIfNeeded(supabase: any, requisitionId: string, grandTotal: number) {
  const { data: req } = await supabase
    .from("requisitions")
    .select("status")
    .eq("id", requisitionId)
    .single();
  if (req?.status === "pending_approval" || req?.status === "approved") {
    await submitEntityForApproval(supabase, {
      entityId: requisitionId,
      entityType: "requisition",
      grandTotalCents: grandTotal,
    });
    toast.info("Requisition total changed — re-submitted for approval.");
  }
}

function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("requisitions")
        .select(REQ_SELECT)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data.map(mapRequisition)) as Requisition[];
    },
  });
}

export function useRequisition(id: string) {
  return useQuery({
    queryKey: ["requisitions", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
      discountCost: number;
      grandTotal: number;
      notes?: string | null;
      workOrderId?: string | null;
      crmJobId?: string | null;
    }) => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      // Prefer profile.name (set during account setup) over auth metadata fallback
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", user!.id).single();
      const requestedByName = profile?.name?.trim() || user?.user_metadata?.name || user?.email || "Unknown";
      // Atomic per-org/year counter, not Date.now() — see next_requisition_number().
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: requisitionNumber, error: numberErr } = await (supabase.rpc as any)("next_requisition_number");
      if (numberErr || !requisitionNumber) throw numberErr ?? new Error("Failed to generate requisition number");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: req, error: reqErr } = await (supabase as any)
        .from("requisitions")
        .insert({
          created_by: user?.id ?? null,
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
          discount_cost: input.discountCost,
          grand_total: input.grandTotal,
          notes: input.notes ?? null,
          work_order_id: input.workOrderId ?? null,
          crm_job_id: input.crmJobId ?? null,
        })
        .select()
        .single();
      if (reqErr) throw reqErr;

      if (input.lineItems.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: lineErr } = await (supabase as any)
          .from("requisition_line_items")
          .insert(
            input.lineItems.map((li) => ({
              requisition_id: req.id,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: full, error: fetchErr } = await (supabase as any)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: inserted, error: lineErr } = await (supabase as any)
        .from("requisition_line_items")
        .insert({
          requisition_id: requisitionId,
          product_item_id: lineItem.productItemId || null,
          part_id: lineItem.partId ?? null,
          product_item_name: lineItem.productItemName,
          part_number: lineItem.partNumber,
          quantity: lineItem.quantity,
          unit_cost: lineItem.unitCost,
          total_cost: lineItem.totalCost,
          project_id: lineItem.projectId ?? null,
          notes: lineItem.notes ?? null,
        })
        .select()
        .single();
      if (lineErr) throw lineErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: reqErr } = await (supabase as any)
        .from("requisitions")
        .update({ subtotal: newSubtotal, sales_tax: newSalesTax, grand_total: newGrandTotal })
        .eq("id", requisitionId);
      if (reqErr) {
        // Header total update failed after the line item was already committed —
        // roll back the line item so the two never drift out of sync.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("requisition_line_items").delete().eq("id", inserted.id);
        throw reqErr;
      }
      await resubmitReqForApprovalIfNeeded(supabase, requisitionId, newGrandTotal);
    },
    onError: (err) => {
      toast.error(`Failed to add line item: ${serializeError(err)}`);
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
      discountCost,
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
      discountCost: number;
      salesTax: number;
      grandTotal: number;
      notes: string | null;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("requisitions")
        .update({
          title,
          vendor_id: vendorId,
          vendor_name: vendorName,
          tax_rate_percent: taxRatePercent,
          shipping_cost: shippingCost,
          discount_cost: discountCost,
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

      const filteredRows = rows.filter((r) => r.title?.trim());
      const inserts = [];
      for (const r of filteredRows) {
        let requisitionNumber = r.requisitionNumber?.trim();
        if (!requisitionNumber) {
          // Atomic per-org/year counter, not Date.now() — see next_requisition_number().
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error: numberErr } = await (supabase.rpc as any)("next_requisition_number");
          if (numberErr || !data) throw numberErr ?? new Error("Failed to generate requisition number");
          requisitionNumber = data;
        }
        inserts.push({
          title: r.title.trim(),
          requisition_number: requisitionNumber,
          requested_by_id: user?.id ?? null,
          requested_by_name: requestedByName,
          vendor_name: r.vendorName?.trim() || null,
          notes: r.notes?.trim() || null,
          subtotal: 0,
          tax_rate_percent: 0,
          sales_tax: 0,
          shipping_cost: 0,
          grand_total: 0,
        });
      }
      if (inserts.length === 0) return 0;

      // Insert one-by-one; on duplicate requisition_number, update the existing row
      let count = 0;
      for (const row of inserts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("requisitions").insert(row);
        if (error?.code === "23505") {
          const { data: { user: u } } = await supabase.auth.getUser();
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", u!.id).single();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("requisitions").update({
            title: row.title,
            requested_by_id: row.requested_by_id,
            requested_by_name: row.requested_by_name,
            vendor_name: row.vendor_name,
            notes: row.notes,
          }).eq("requisition_number", row.requisition_number).eq("org_id", profile!.org_id).is("deleted_at", null);
        } else if (error) {
          throw error;
        }
        count++;
      }
      return count;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
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

/** Updates a single line item on an existing requisition and recalculates totals. */
export function useUpdateRequisitionLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lineItemId,
      requisitionId,
      quantity,
      unitCost,
      projectId,
      newSubtotal,
      newSalesTax,
      newGrandTotal,
    }: {
      lineItemId: string;
      requisitionId: string;
      quantity: number;
      unitCost: number;
      projectId: string | null;
      newSubtotal: number;
      newSalesTax: number;
      newGrandTotal: number;
    }) => {
      const supabase = createClient();
      // Capture the pre-update row so the line item can be reverted if the
      // header total update below fails after this write already committed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: previousLine, error: fetchErr } = await (supabase as any)
        .from("requisition_line_items")
        .select("quantity, unit_cost, total_cost, project_id")
        .eq("id", lineItemId)
        .single();
      if (fetchErr) throw fetchErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: lineErr } = await (supabase as any)
        .from("requisition_line_items")
        .update({
          quantity,
          unit_cost: unitCost,
          total_cost: Math.round(quantity * unitCost),
          project_id: projectId,
        })
        .eq("id", lineItemId);
      if (lineErr) throw lineErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: reqErr } = await (supabase as any)
        .from("requisitions")
        .update({ subtotal: newSubtotal, sales_tax: newSalesTax, grand_total: newGrandTotal })
        .eq("id", requisitionId);
      if (reqErr) {
        // Header total update failed after the line item was already committed —
        // revert the line item to its previous values so the two never drift.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("requisition_line_items")
          .update({
            quantity: previousLine.quantity,
            unit_cost: previousLine.unit_cost,
            total_cost: previousLine.total_cost,
            project_id: previousLine.project_id,
          })
          .eq("id", lineItemId);
        throw reqErr;
      }
      await resubmitReqForApprovalIfNeeded(supabase, requisitionId, newGrandTotal);
    },
    onError: (err) => {
      toast.error(`Failed to save line item: ${serializeError(err)}`);
    },
    onSuccess: (_, { requisitionId }) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["requisitions", requisitionId] });
    },
  });
}

/** Hard-deletes a single line item from an existing requisition and recalculates totals. */
export function useDeleteRequisitionLineItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      lineItemId,
      requisitionId,
      newSubtotal,
      newSalesTax,
      newGrandTotal,
    }: {
      lineItemId: string;
      requisitionId: string;
      newSubtotal: number;
      newSalesTax: number;
      newGrandTotal: number;
    }) => {
      const supabase = createClient();
      // Capture the full row before deleting so it can be restored if the
      // header total update below fails after the delete already committed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: deletedLine, error: lineErr } = await (supabase as any)
        .from("requisition_line_items")
        .delete()
        .eq("id", lineItemId)
        .select()
        .single();
      if (lineErr) throw lineErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: reqErr } = await (supabase as any)
        .from("requisitions")
        .update({ subtotal: newSubtotal, sales_tax: newSalesTax, grand_total: newGrandTotal })
        .eq("id", requisitionId);
      if (reqErr) {
        // Header total update failed after the line item was already deleted —
        // restore the deleted row so the two never drift out of sync.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("requisition_line_items").insert(deletedLine);
        throw reqErr;
      }
      await resubmitReqForApprovalIfNeeded(supabase, requisitionId, newGrandTotal);
    },
    onError: (err) => {
      toast.error(`Failed to delete line item: ${serializeError(err)}`);
    },
    onSuccess: (_, { requisitionId }) => {
      queryClient.invalidateQueries({ queryKey: ["requisitions"] });
      queryClient.invalidateQueries({ queryKey: ["requisitions", requisitionId] });
    },
  });
}

export function useDeleteRequisition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("requisitions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requisitions"] }),
  });
}
