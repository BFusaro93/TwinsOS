"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMRole, Permissions } from "@/types/crm-roles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRole(row: any): CRMRole {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description ?? null,
    permissions: (row.permissions as Permissions) ?? {},
    isActive: row.is_active ?? true,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
  };
}

export function useRoles(activeOnly = false) {
  return useQuery({
    queryKey: ["crm-roles", { activeOnly }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_roles")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data.map(mapRole)) as any[];
    },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string; permissions?: Permissions }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_roles")
        .insert({
          name: values.name,
          description: values.description ?? null,
          permissions: values.permissions ?? {},
        })
        .select()
        .single();
      if (error) throw error;
      return mapRole(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<{ name: string; description: string | null; permissions: Permissions; is_active: boolean }>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_roles")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_roles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-roles"] }),
  });
}
