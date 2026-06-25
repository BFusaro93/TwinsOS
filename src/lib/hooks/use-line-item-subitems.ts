"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface LineItemSubitem {
  id: string;
  orgId: string;
  lineItemId: string;
  type: "product" | "subservice";
  productId: string | null;
  serviceId: string | null;
  name: string;
  qty: number;
  rateCents: number;
  costCents: number;
  totalCents: number;
  confirmQty: boolean;
  invoice: boolean;
  printOnInvoice: boolean;
  createInstalledProduct: boolean;
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): LineItemSubitem {
  return {
    id: row.id,
    orgId: row.org_id,
    lineItemId: row.line_item_id,
    type: row.type,
    productId: row.product_id ?? null,
    serviceId: row.service_id ?? null,
    name: row.name,
    qty: row.qty,
    rateCents: row.rate_cents,
    costCents: row.cost_cents,
    totalCents: row.total_cents,
    confirmQty: row.confirm_qty ?? false,
    invoice: row.invoice ?? false,
    printOnInvoice: row.print_on_invoice ?? false,
    createInstalledProduct: row.create_installed_product ?? false,
    sortOrder: row.sort_order ?? 0,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
  };
}

export function useLineItemSubitems(lineItemId: string) {
  return useQuery<LineItemSubitem[]>({
    queryKey: ["subitems", lineItemId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_line_item_subitems")
        .select("*")
        .eq("line_item_id", lineItemId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => mapRow(row));
    },
    enabled: !!lineItemId,
  });
}

export interface UpsertSubitemPayload {
  lineItemId: string;
  item: {
    id?: string;
    type: "product" | "subservice";
    productId?: string | null;
    serviceId?: string | null;
    name: string;
    qty: number;
    rateCents: number;
    costCents: number;
    totalCents: number;
    confirmQty?: boolean;
    invoice?: boolean;
    printOnInvoice?: boolean;
    createInstalledProduct?: boolean;
    sortOrder?: number;
  };
}

export function useUpsertSubitem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ lineItemId, item }: UpsertSubitemPayload) => {
      const supabase = createClient();
      const row = {
        ...(item.id ? { id: item.id } : {}),
        line_item_id: lineItemId,
        type: item.type,
        product_id: item.productId ?? null,
        service_id: item.serviceId ?? null,
        name: item.name,
        qty: item.qty,
        rate_cents: item.rateCents,
        cost_cents: item.costCents,
        total_cents: item.totalCents,
        confirm_qty: item.confirmQty ?? false,
        invoice: item.invoice ?? false,
        print_on_invoice: item.printOnInvoice ?? false,
        create_installed_product: item.createInstalledProduct ?? false,
        sort_order: item.sortOrder ?? 0,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_line_item_subitems")
        .upsert(row, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;
      return mapRow(data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subitems", variables.lineItemId] });
    },
  });
}

export function useDeleteSubitem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, lineItemId }: { id: string; lineItemId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_line_item_subitems")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { id, lineItemId };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["subitems", variables.lineItemId] });
    },
  });
}
