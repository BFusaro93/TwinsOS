import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { mapGoodsReceipt } from "@/lib/supabase/mappers";
import type { GoodsReceipt, GoodsReceiptLine } from "@/types/receiving";

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

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
      return (data.map(mapGoodsReceipt)) as GoodsReceipt[];
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
      const { data: { user } } = await supabase.auth.getUser();
      const { data: header, error: headerError } = await supabase
        .from("goods_receipts")
        .insert({
          created_by: user?.id ?? null,
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: linesError } = await (supabase as any).from("goods_receipt_lines").insert(lineInserts);
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
    onError: (err) => {
      toast.error(`Failed to record receipt: ${errMsg(err)}`);
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
        .select("org_id, receipt_number, notes, tax_rate_percent, shipping_cost, po_number")
        .eq("id", input.id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentLines } = await (supabase as any)
        .from("goods_receipt_lines")
        .select("id, quantity_received, po_line_item_id, part_number, is_maint_part")
        .eq("receipt_id", input.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type CurrentLine = { id: string; quantity_received: number; po_line_item_id: string | null; part_number: string; is_maint_part: boolean };
      const oldByLineId = new Map<string, CurrentLine>(
        (currentLines ?? []).map((l: CurrentLine) => [l.id, l])
      );

      // Collect quantity changes for audit entries + inventory adjustment
      const qtyChanges: Array<{
        name: string; oldQty: number; newQty: number; delta: number;
        poLineItemId: string | null; partNumber: string; isMaintPart: boolean;
      }> = [];
      for (const line of input.lines) {
        const old = oldByLineId.get(line.id);
        if (old !== undefined && old.quantity_received !== line.quantityReceived) {
          qtyChanges.push({
            name: line.productItemName,
            oldQty: old.quantity_received,
            newQty: line.quantityReceived,
            delta: line.quantityReceived - old.quantity_received,
            poLineItemId: old.po_line_item_id,
            partNumber: old.part_number,
            isMaintPart: old.is_maint_part,
          });
        }
      }

      // ── Adjust inventory by the delta ────────────────────────────────────
      // A receipt line's quantity_received is the only place parts/product
      // quantity_on_hand is derived from — correcting it here (up or down)
      // must move inventory by the same delta, or it silently drifts from
      // what the receipt claims was received. Resolve the catalog product the
      // same way the initial-receipt flow does: by the PO line item's
      // product_item_id first, falling back to part number then exact name.
      if (qtyChanges.length > 0 && currentReceipt) {
        const poLineItemIds = qtyChanges.map((c) => c.poLineItemId).filter((v): v is string => !!v);
        const { data: poLineItems } = poLineItemIds.length > 0
          ? await supabase.from("po_line_items").select("id, product_item_id").in("id", poLineItemIds)
          : { data: [] as { id: string; product_item_id: string | null }[] };

        const { data: products } = await supabase
          .from("product_items")
          .select("id, name, part_number, quantity_on_hand")
          .is("deleted_at", null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: parts } = await (supabase as any)
          .from("parts")
          .select("id, part_number, product_item_id")
          .is("deleted_at", null);

        for (const chg of qtyChanges) {
          const poLineItem = poLineItems?.find((pli) => pli.id === chg.poLineItemId);
          const matchedProduct =
            (poLineItem?.product_item_id ? products?.find((p) => p.id === poLineItem.product_item_id) : null) ??
            (chg.partNumber ? products?.find((p) => p.part_number === chg.partNumber) : null) ??
            (chg.name ? products?.find((p) => p.name === chg.name) : null);

          if (!matchedProduct) {
            throw new Error(`Could not find a catalog product for "${chg.name}" — inventory was not adjusted, receipt not saved.`);
          }

          if (chg.isMaintPart) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const linkedPart = parts?.find((pt: any) => pt.product_item_id === matchedProduct.id) ??
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (chg.partNumber ? parts?.find((pt: any) => pt.part_number === chg.partNumber) : null);
            if (linkedPart) {
              const { error: adjustErr } = await supabase.rpc("adjust_part_quantity", {
                p_org_id: currentReceipt.org_id,
                p_part_id: linkedPart.id,
                p_delta: chg.delta,
                p_po_number: (currentReceipt.po_number as string | null) ?? "",
              });
              if (adjustErr) throw adjustErr;
            }
          }

          const { error: prodErr } = await supabase
            .from("product_items")
            .update({ quantity_on_hand: matchedProduct.quantity_on_hand + chg.delta })
            .eq("id", matchedProduct.id);
          if (prodErr) throw prodErr;
        }
      }

      // Update line items — only after inventory adjustment has succeeded,
      // so a failure there (e.g. no matching catalog product) doesn't leave
      // the receipt line showing a corrected quantity with inventory unmoved.
      for (const line of input.lines) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: lineError } = await (supabase as any)
          .from("goods_receipt_lines")
          .update({
            quantity_received: line.quantityReceived,
            quantity_remaining: line.quantityOrdered - line.quantityReceived,
          })
          .eq("id", line.id);
        if (lineError) throw lineError;
      }

      if (currentReceipt) {
        const taxRate = currentReceipt.tax_rate_percent as number;
        const shippingCost = currentReceipt.shipping_cost as number;
        const newSubtotal = Math.round(input.lines.reduce((sum, l) => sum + l.quantityReceived * l.unitCost, 0));
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

      // Write audit entries for quantity changes via SECURITY DEFINER RPC
      if (currentReceipt && qtyChanges.length > 0) {
        for (const chg of qtyChanges) {
          await supabase.rpc("insert_audit_entry", {
            p_org_id: currentReceipt.org_id as string,
            p_record_type: "receiving",
            p_record_id: input.id,
            p_action: "updated",
            p_description: `${chg.name}: Quantity received ${chg.oldQty} → ${chg.newQty}`,
            p_field_changed: "quantity_received",
            p_old_value: String(chg.oldQty),
            p_new_value: String(chg.newQty),
          });
        }
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
    onError: (err) => {
      toast.error(`Failed to update receipt: ${errMsg(err)}`);
    },
  });
}
