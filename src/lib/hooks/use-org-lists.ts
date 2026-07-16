"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface OrgListOption {
  id: string;
  orgId: string;
  listName: string;
  value: string;
  sortOrder: number;
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
      return data.map(mapOption) as OrgListOption[];
    },
  });
}

export function useAddOrgListItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listName, value }: { listName: string; value: string }) => {
      const supabase = createClient();
      const orgId = await getOrgId();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_list_options")
        .insert({ org_id: orgId, list_name: listName, value });
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
