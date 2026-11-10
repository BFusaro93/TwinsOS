"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/** Server-side lookups for the Cmd-K search's Invoices and Estimates groups.
 *  The search used to download every invoice and estimate in the org (with
 *  line items) the first time it opened and filter them in the browser; these
 *  fetch at most GLOBAL_SEARCH_LIMIT matches per typed term instead. */
export const GLOBAL_SEARCH_LIMIT = 20;

export interface InvoiceSearchHit {
  id: string;
  invoiceNumber: number | null;
  status: string;
  clientName: string | null;
}

export interface EstimateSearchHit {
  id: string;
  estimateNumber: number | null;
  stage: string;
  description: string | null;
  clientName: string | null;
}

/** "INV-123", "#123", "est 45" → 123 / 45; null when the term isn't a number. */
function numberInTerm(term: string): number | null {
  const m = term.trim().match(/^(?:inv|est|estimate|invoice)?[\s\-#]*0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}

/** ilike pattern with the user's % and _ treated literally. */
function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function mergeById<T extends { id: string }>(lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out.slice(0, GLOBAL_SEARCH_LIMIT);
}

type ClientEmbed = { display_name: string | null } | { display_name: string | null }[] | null;
function embeddedName(c: ClientEmbed): string | null {
  if (!c) return null;
  return (Array.isArray(c) ? c[0]?.display_name : c.display_name) ?? null;
}

export function useInvoiceSearch(term: string, enabled = true) {
  const t = term.trim();
  return useQuery({
    queryKey: ["global-search", "invoices", t],
    enabled: enabled && t.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<InvoiceSearchHit[]> => {
      const supabase = createClient();
      const num = numberInTerm(t);
      const byNumber = num != null
        ? supabase
            .from("crm_invoices")
            .select("id, invoice_number, status, clients(display_name)")
            .is("deleted_at", null)
            .eq("invoice_number", num)
            .limit(GLOBAL_SEARCH_LIMIT)
        : null;
      const byClient = supabase
        .from("crm_invoices")
        .select("id, invoice_number, status, clients!inner(display_name)")
        .is("deleted_at", null)
        .ilike("clients.display_name", containsPattern(t))
        .order("invoice_date", { ascending: false })
        .order("id")
        .limit(GLOBAL_SEARCH_LIMIT);
      const [numRes, clientRes] = await Promise.all([byNumber, byClient]);
      if (numRes?.error) throw numRes.error;
      if (clientRes.error) throw clientRes.error;
      const map = (rows: { id: string; invoice_number: number | null; status: string; clients: ClientEmbed }[]) =>
        rows.map((r) => ({
          id: r.id,
          invoiceNumber: r.invoice_number,
          status: r.status,
          clientName: embeddedName(r.clients),
        }));
      return mergeById([map(numRes?.data ?? []), map(clientRes.data ?? [])]);
    },
  });
}

export function useEstimateSearch(term: string, enabled = true) {
  const t = term.trim();
  return useQuery({
    queryKey: ["global-search", "estimates", t],
    enabled: enabled && t.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async (): Promise<EstimateSearchHit[]> => {
      const supabase = createClient();
      const num = numberInTerm(t);
      const select = "id, estimate_number, stage, description, clients(display_name)";
      const byNumber = num != null
        ? supabase
            .from("estimates")
            .select(select)
            .is("deleted_at", null)
            .eq("estimate_number", num)
            .limit(GLOBAL_SEARCH_LIMIT)
        : null;
      const byClient = supabase
        .from("estimates")
        .select("id, estimate_number, stage, description, clients!inner(display_name)")
        .is("deleted_at", null)
        .ilike("clients.display_name", containsPattern(t))
        .order("created_at", { ascending: false })
        .order("id")
        .limit(GLOBAL_SEARCH_LIMIT);
      const byDescription = supabase
        .from("estimates")
        .select(select)
        .is("deleted_at", null)
        .ilike("description", containsPattern(t))
        .order("created_at", { ascending: false })
        .order("id")
        .limit(GLOBAL_SEARCH_LIMIT);
      const [numRes, clientRes, descRes] = await Promise.all([byNumber, byClient, byDescription]);
      if (numRes?.error) throw numRes.error;
      if (clientRes.error) throw clientRes.error;
      if (descRes.error) throw descRes.error;
      const map = (rows: { id: string; estimate_number: number | null; stage: string; description: string | null; clients: ClientEmbed }[]) =>
        rows.map((r) => ({
          id: r.id,
          estimateNumber: r.estimate_number,
          stage: r.stage,
          description: r.description,
          clientName: embeddedName(r.clients),
        }));
      return mergeById([map(numRes?.data ?? []), map(clientRes.data ?? []), map(descRes.data ?? [])]);
    },
  });
}
