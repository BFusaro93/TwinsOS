"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

export interface OrgListOption {
  id: string;
  orgId: string;
  listName: string;
  value: string;
  sortOrder: number;
  /** Optional category (client tags are grouped by it). */
  group: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOption(row: any): OrgListOption {
  return {
    id: row.id,
    orgId: row.org_id,
    listName: row.list_name,
    value: row.value,
    sortOrder: row.sort_order,
    group: row.group_name ?? null,
    createdAt: row.created_at,
  };
}

async function getOrgId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (error) throw error;
  return profile.org_id as string;
}

export function useOrgList(listName: string) {
  return useQuery({
    queryKey: ["crm_list_options", listName],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_list_options")
        .select("*")
        .eq("list_name", listName)
        .is("deleted_at", null)
        .order("sort_order")
        .order("value");
      if (error) throw error;
      // Alphabetical (case-insensitive, numbers in natural order) so the Settings
      // editors and every dropdown read the same. sort_order only breaks ties:
      // rows added one at a time or imported in bulk used to show in insert order.
      return (data.map(mapOption) as OrgListOption[]).sort(
        (a, b) =>
          a.value.localeCompare(b.value, undefined, { sensitivity: "base", numeric: true }) ||
          a.sortOrder - b.sortOrder,
      );
    },
  });
}

export function useAddOrgListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listName, value, group }: { listName: string; value: string; group?: string | null }) => {
      const supabase = createClient();
      const orgId = await getOrgId();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_list_options")
        .insert({ org_id: orgId, list_name: listName, value, group_name: group?.trim() || null });
      if (error) throw error;
    },
    onSuccess: (_data, { listName }) => {
      qc.invalidateQueries({ queryKey: ["crm_list_options", listName] });
    },
  });
}

export function useDeleteOrgListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, listName }: { id: string; listName: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_list_options")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return listName;
    },
    onSuccess: (_data, { listName }) => {
      qc.invalidateQueries({ queryKey: ["crm_list_options", listName] });
    },
  });
}

/** Lists whose options can be renamed. The rename also updates every record that stores the old name as text. */
export const RENAMABLE_LISTS: readonly string[] = [
  "ticket_categories", "cancellation_reasons", "client_sources", "estimate_reasons",
  "estimate_lost_reasons", "service_categories", "client_tags", "contact_types",
];

/** Renames a list option and carries the new name to existing records. */
export function useRenameOrgListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string; listName: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("rename_org_list_option", { p_id: id, p_new_value: value });
      if (error) throw error;
    },
    onSuccess: (_data, { listName }) => {
      qc.invalidateQueries({ queryKey: ["crm_list_options", listName] });
      qc.invalidateQueries({ queryKey: ["crm_tickets"] });
      qc.invalidateQueries({ queryKey: ["client_portal_settings"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}

/** Sets (or clears) an option's category, e.g. which group a client tag sits under. */
export function useSetOrgListItemGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, group }: { id: string; group: string | null; listName: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_list_options")
        .update({ group_name: group?.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { listName }) => {
      qc.invalidateQueries({ queryKey: ["crm_list_options", listName] });
    },
  });
}

/** Groups options under their category, categories A-Z, uncategorized last. Options keep their incoming order. */
export function groupOptionsByCategory<T extends { group: string | null }>(items: T[]): { group: string | null; items: T[] }[] {
  const map = new Map<string | null, T[]>();
  for (const it of items) {
    const key = it.group?.trim() || null;
    map.set(key, [...(map.get(key) ?? []), it]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { sensitivity: "base" })))
    .map(([group, list]) => ({ group, items: list }));
}
