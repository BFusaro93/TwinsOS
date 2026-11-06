"use client";

import { useMemo } from "react";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { Client } from "@/types/crm";

/** One row of the Account Statements run. */
export interface StatementAccountRow {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  /** The account's own open balance, plus its sub-accounts' for a parent account. */
  balanceCents: number;
  /** Number of sub-accounts with a balance rolled into balanceCents. */
  subAccountCount: number;
}

/**
 * The clients a statement run is for. A parent account's statement rolls up its
 * sub-accounts (src/lib/invoices/account-statement-data.ts), so a parent is listed
 * with its sub-accounts' balances added — including a parent whose OWN balance is
 * zero (it wasn't listed before, so its rolled-up statement could never be run in
 * bulk). The sub-accounts stay listed too; each can still get its own statement.
 * `clients` is the "has a balance" list.
 */
export function useStatementAccounts(clients: Client[]) {
  const listed = useMemo(() => new Set(clients.map((c) => c.id)), [clients]);
  const missingParentIds = useMemo(
    () =>
      [...new Set(clients.map((c) => c.parentClientId).filter((id): id is string => !!id && !listed.has(id)))].sort(),
    [clients, listed]
  );

  const { data: missingParents = [], isLoading } = useQuery({
    queryKey: ["clients", "statement-parents", missingParentIds],
    enabled: missingParentIds.length > 0,
    queryFn: async () => {
      const supabase = createClient();
      const out: { id: string; display_name: string; primary_email: string | null; balance_outstanding_cents: number | null }[] = [];
      for (let i = 0; i < missingParentIds.length; i += 200) {
        const { data, error } = await supabase
          .from("clients")
          .select("id, display_name, primary_email, balance_outstanding_cents")
          .in("id", missingParentIds.slice(i, i + 200))
          .is("deleted_at", null);
        if (error) throw error;
        out.push(...((data ?? []) as typeof out));
      }
      return out;
    },
  });

  const rows = useMemo<StatementAccountRow[]>(() => {
    const childTotals = new Map<string, { cents: number; count: number }>();
    for (const c of clients) {
      if (!c.parentClientId) continue;
      const t = childTotals.get(c.parentClientId) ?? { cents: 0, count: 0 };
      t.cents += c.balanceOutstandingCents ?? 0;
      t.count += 1;
      childTotals.set(c.parentClientId, t);
    }
    const out: StatementAccountRow[] = clients.map((c) => {
      const kids = childTotals.get(c.id);
      return {
        id: c.id,
        displayName: c.displayName,
        primaryEmail: c.primaryEmail ?? null,
        balanceCents: (c.balanceOutstandingCents ?? 0) + (kids?.cents ?? 0),
        subAccountCount: kids?.count ?? 0,
      };
    });
    for (const p of missingParents) {
      const kids = childTotals.get(p.id);
      out.push({
        id: p.id,
        displayName: p.display_name,
        primaryEmail: p.primary_email,
        balanceCents: (p.balance_outstanding_cents ?? 0) + (kids?.cents ?? 0),
        subAccountCount: kids?.count ?? 0,
      });
    }
    return out.sort((a, b) => b.balanceCents - a.balanceCents);
  }, [clients, missingParents]);

  return { rows, isLoading };
}
