import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapGoodsReceipt } from "@/lib/supabase/mappers";
import type { GoodsReceipt, GoodsReceiptLine } from "@/types/receiving";

export type GoodsReceiptLineUpdate = {
  id: string;
  productItemName: string;
  quantityReceived: number;
  previousQuantityReceived?: number;
  quantityOrdered: number;
  unitCost: number;
};

export function useGoodsReceipts() {
  return useQuery({
    queryKey: ["goods-receipts"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("*, goods_receipt_lines (*)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapGoodsReceipt);
    },
  });
}

export function useGoodsReceipt(id: string) {
  return useQuery({
    queryKey: ["goods-receipts", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("*, goods_receipt_lines (*)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapGoodsReceipt(data);
    },
    enabled: !!id,
  });
}

export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<GoodsReceipt, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data: header, error: headerError } = await supabase
        .from("goods_receipts")
        .insert({
          receipt_number: input.receiptNumber,
          purchase_order_id: input.purchaseOrderId,
          po_number: input.poNumber,
          vendor_name: input.vendorName,
          received_by_id: input.receivedById,
          received_by_name: input.receivedByName,
          received_at: input.receivedAt,
          subtotal: input.subtotal,
          tax_rate_percent: input.taxRatePercent,
          sales_tax: input.salesTax,
          shipping_cost: input.shippingCost,
          grand_total: input.grandTotal,
          notes: input.notes,
        })
        .select()
        .single();
      if (headerError) throw headerError;

      if (input.lines.length > 0) {
        const lineInserts = input.lines.map((line: GoodsReceiptLine) => ({
          receipt_id: header.id,
          po_line_item_id: line.lineItemId || null,
          product_item_name: line.productItemName,
          part_number: line.partNumber,
          quantity_ordered: line.quantityOrdered,
          quantity_received: line.quantityReceived,
          quantity_remaining: line.quantityRemaining,
          unit_cost: line.unitCost,
          is_maint_part: line.isMaintPart,
        }));
        const { error: linesError } = await supabase.from("goods_receipt_lines").insert(lineInserts);
        if (linesError) throw linesError;
      }

      const { data: full, error: fetchError } = await supabase
        .from("goods_receipts")
        .select("*, goods_receipt_lines (*)")
        .eq("id", header.id)
        .single();
      if (fetchError) throw fetchError;
      return mapGoodsReceipt(full);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export function useUpdateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      notes: string | null;
      lines: GoodsReceiptLineUpdate[];
    }) => {
      const supabase = createClient();

      // Fetch current receipt header + line quantities for audit comparison
      const { data: currentReceipt } = await supabase
        .from("goods_receipts")
        .select("org_id, receipt_number, notes, tax_rate_percent, shipping_cost")
        .eq("id", input.id)
        .single();

      const { data: currentLines } = await supabase
        .from("goods_receipt_lines")
        .select("id, quantity_received")
        .eq("goods_receipt_id", input.id);
      const oldByLineId = new Map(
        (currentLines ?? []).map((l) => [l.id, l.quantity_received as number])
      );

      // Update line items
      for (const line of input.lines) {
        const { error: lineError } = await supabase
          .from("goods_receipt_lines")
          .update({
            quantity_received: line.quantityReceived,
            quantity_remaining: line.quantityOrdered - line.quantityReceived,
          })
          .eq("id", line.id);
        if (lineError) throw lineError;
      }

      // Write audit entries for each changed line item quantity
      if (currentReceipt) {
        // Get current user for audit entries
        const { data: { user } } = await supabase.auth.getUser();
        let userName = "System";
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("name")
            .eq("id", user.id)
            .single();
          userName = profile?.name ?? user.email ?? "System";
        }

        for (const line of input.lines) {
          const oldQty = oldByLineId.get(line.id);
          if (oldQty !== undefined && oldQty !== line.quantityReceived) {
            await supabase.from("audit_log").insert({
              org_id: currentReceipt.org_id,
              created_by: user?.id ?? null,
              record_type: "receiving",
              record_id: input.id,
              action: "updated",
              changed_by_name: userName,
              description: `${line.productItemName}: Quantity received ${oldQty} → ${line.quantityReceived}`,
              field_changed: "quantity_received",
              old_value: String(oldQty),
              new_value: String(line.quantityReceived),
            }).select().single();
          }
        }
      }

      // Build a single header update with notes + recalculated totals
      // (one DB write = one trigger fire with all changed fields)
      if (currentReceipt) {
        const taxRate = currentReceipt.tax_rate_percent as number;
        const shippingCost = currentReceipt.shipping_cost as number;
        const newSubtotal = input.lines.reduce((sum, l) => sum + l.quantityReceived * l.unitCost, 0);
        const newSalesTax = Math.round(newSubtotal * (taxRate / 100));
        const newGrandTotal = newSubtotal + newSalesTax + shippingCost;

        const headerPatch: Record<string, unknown> = {
          subtotal: newSubtotal,
          sales_tax: newSalesTax,
          grand_total: newGrandTotal,
        };
        // Only include notes if it actually changed to avoid spurious audit entries
        if (input.notes !== (currentReceipt.notes as string | null)) {
          headerPatch.notes = input.notes;
        }

        await supabase.from("goods_receipts").update(headerPatch).eq("id", input.id);
      }
      const { data, error: fetchError } = await supabase
        .from("goods_receipts")
        .select("*, goods_receipt_lines (*)")
        .eq("id", input.id)
        .single();
      if (fetchError) throw fetchError;
      return mapGoodsReceipt(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["goods-receipts", id] });
      queryClient.invalidateQueries({ queryKey: ["audit-log", "receiving", id] });
    },
  });
}
