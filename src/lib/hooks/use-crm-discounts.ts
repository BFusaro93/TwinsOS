"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMDiscount, DiscountType } from "@/types/crm-discounts";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapDiscount(row: Record<string, any>): CRMDiscount {
  return {
    id: row.id,
    name: row.name,
    discountType: row.discount_type,
    percentBps: row.percent_bps,
    flatCents: row.flat_cents,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function useDiscounts() {
  return useQuery({
    queryKey: ["crm-discounts"],
    queryFn: async () => {
      const db = createClient() as any;
      const { data, error } = await db
        .from("crm_discounts")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Record<string, any>[]).map(mapDiscount);
    },
  });
}

export interface DiscountInput {
  name: string;
  discountType: DiscountType;
  percentBps?: number | null;
  flatCents?: number | null;
}

export function useCreateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DiscountInput) => {
      const db = createClient() as any;
      const { error } = await db.from("crm_discounts").insert({
        name: input.name,
        discount_type: input.discountType,
        percent_bps: input.discountType === "percent" ? input.percentBps ?? null : null,
        flat_cents: input.discountType === "flat" ? input.flatCents ?? null : null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-discounts"] }),
  });
}

export function useUpdateDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<DiscountInput & { isActive: boolean }> }) => {
      const db = createClient() as any;
      const patch: Record<string, any> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.isActive !== undefined) patch.is_active = updates.isActive;
      if (updates.discountType !== undefined) {
        patch.discount_type = updates.discountType;
        patch.percent_bps = updates.discountType === "percent" ? updates.percentBps ?? null : null;
        patch.flat_cents = updates.discountType === "flat" ? updates.flatCents ?? null : null;
      }
      const { error } = await db.from("crm_discounts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-discounts"] }),
  });
}

export function useDeleteDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = createClient() as any;
      const { error } = await db
        .from("crm_discounts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-discounts"] }),
  });
}
