"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

export interface InvoiceNumbering {
  nextNumber: number;
  maxExisting: number | null;
  perOrg: boolean;
}

/** The number the next invoice will get, plus the highest live invoice number. */
export function useInvoiceNumbering() {
  return useQuery({
    queryKey: ["invoice-numbering"],
    queryFn: async (): Promise<InvoiceNumbering> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("get_invoice_numbering");
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { next_number: number; max_existing: number | null; per_org: boolean } | null;
      return {
        nextNumber: Number(row?.next_number ?? 1),
        maxExisting: row?.max_existing != null ? Number(row.max_existing) : null,
        perOrg: !!row?.per_org,
      };
    },
  });
}

/** Start invoices at #N (e.g. continuing the sequence from the software the org is leaving). */
export function useSetNextInvoiceNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (next: number) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("set_next_invoice_number", { p_next: next });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoice-numbering"] });
    },
  });
}
