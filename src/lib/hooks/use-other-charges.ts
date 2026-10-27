"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMOtherCharge } from "@/types/crm-invoices";
import { recalcInvoiceTotalsFromLines } from "@/lib/hooks/use-invoices";

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapOtherCharge(row: Record<string, any>): CRMOtherCharge {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    amountCents: row.amount_cents ?? 0,
    isTaxable: !!row.is_taxable,
    isActive: !!row.is_active,
    sortOrder: row.sort_order ?? 0,
  };
}

export function useOtherCharges() {
  return useQuery({
    queryKey: ["crm-other-charges"],
    queryFn: async () => {
      const db = createClient() as any;
      const { data, error } = await db
        .from("crm_other_charges")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return ((data ?? []) as Record<string, any>[]).map(mapOtherCharge);
    },
  });
}

export interface OtherChargeInput {
  name: string;
  description: string;
  amountCents: number;
  isTaxable: boolean;
}

export function useCreateOtherCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OtherChargeInput) => {
      const db = createClient() as any;
      const { error } = await db.from("crm_other_charges").insert({
        name: input.name,
        description: input.description,
        amount_cents: input.amountCents,
        is_taxable: input.isTaxable,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-other-charges"] }),
  });
}

/** Standard fees offered by the "Add common charges" button; amounts start at $0 so each org sets its own. */
export const COMMON_OTHER_CHARGES: { name: string; description: string }[] = [
  { name: "Bond Fee", description: "Bond Fee" },
  { name: "Credit Card Processing Fee", description: "Credit Card Processing Fee" },
  { name: "Fuel Surcharge", description: "Fuel Surcharge" },
  { name: "Interest", description: "Interest" },
  { name: "Late Fee", description: "Late Fee" },
  { name: "Local Agency Fee", description: "Local Agency Fee" },
  { name: "Permit Fee", description: "Permit Fee" },
  { name: "Returned Check Fee", description: "Returned Check Fee" },
  { name: "Trip Charge", description: "Trip Charge" },
];

/** Inserts the common charges this org doesn't already have (matched by name, case-insensitive). Returns how many were added. */
export function useSeedCommonOtherCharges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (existingNames: string[]) => {
      const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
      const rows = COMMON_OTHER_CHARGES.filter((c) => !have.has(c.name.toLowerCase())).map((c, i) => ({
        name: c.name,
        description: c.description,
        amount_cents: 0,
        is_taxable: false,
        sort_order: i,
      }));
      if (rows.length === 0) return 0;
      const db = createClient() as any;
      const { error } = await db.from("crm_other_charges").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-other-charges"] }),
  });
}

export function useUpdateOtherCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<OtherChargeInput & { isActive: boolean }> }) => {
      const db = createClient() as any;
      const patch: Record<string, any> = {};
      if (updates.name !== undefined) patch.name = updates.name;
      if (updates.description !== undefined) patch.description = updates.description;
      if (updates.amountCents !== undefined) patch.amount_cents = updates.amountCents;
      if (updates.isTaxable !== undefined) patch.is_taxable = updates.isTaxable;
      if (updates.isActive !== undefined) patch.is_active = updates.isActive;
      const { error } = await db.from("crm_other_charges").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-other-charges"] }),
  });
}

export function useDeleteOtherCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = createClient() as any;
      const { error } = await db
        .from("crm_other_charges")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-other-charges"] }),
  });
}

export interface BulkAddResult {
  added: number;
  skipped: { invoiceId: string; reason: string }[];
}

/**
 * Adds one other charge to each of the given invoices. Each invoice is
 * handled independently (locked / void / failed ones are skipped with a
 * reason) and its header totals are re-derived from the lines afterwards.
 */
export function useAddOtherChargeToInvoices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceIds,
      charge,
    }: {
      invoiceIds: string[];
      /** amountCents lets the caller override the catalog amount for this run. */
      charge: Pick<CRMOtherCharge, "name" | "description" | "amountCents" | "isTaxable">;
    }): Promise<BulkAddResult> => {
      const supabase = createClient() as any;
      const result: BulkAddResult = { added: 0, skipped: [] };

      for (const invoiceId of invoiceIds) {
        try {
          const { data: inv, error: invErr } = await supabase
            .from("crm_invoices")
            .select("id, status, locked")
            .eq("id", invoiceId)
            .single();
          if (invErr) throw invErr;
          if (inv.status === "void") { result.skipped.push({ invoiceId, reason: "Void" }); continue; }
          if (inv.locked) { result.skipped.push({ invoiceId, reason: "Locked" }); continue; }

          const { count } = await supabase
            .from("crm_invoice_line_items")
            .select("id", { count: "exact", head: true })
            .eq("invoice_id", invoiceId);

          const { error: insErr } = await supabase.from("crm_invoice_line_items").insert({
            invoice_id: invoiceId,
            name: charge.name,
            description: charge.description || charge.name,
            qty: 1,
            rate_cents: charge.amountCents,
            total_cents: charge.amountCents,
            is_taxable: charge.isTaxable,
            is_other_charge: true,
            sort_order: count ?? 0,
          });
          if (insErr) throw insErr;
          await recalcInvoiceTotalsFromLines(supabase, invoiceId);
          result.added++;
        } catch (err) {
          result.skipped.push({ invoiceId, reason: err instanceof Error ? err.message : "Failed" });
        }
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
