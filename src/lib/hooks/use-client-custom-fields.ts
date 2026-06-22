"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface CustomFieldDef {
  id: string;
  orgId: string;
  name: string;
  fieldType: "text" | "number";
  unit: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ClientCustomFieldValue {
  id: string;
  clientId: string;
  fieldDefId: string;
  valueText: string | null;
  valueNumber: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDef(row: any): CustomFieldDef {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    fieldType: row.field_type,
    unit: row.unit ?? null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapValue(row: any): ClientCustomFieldValue {
  return {
    id: row.id,
    clientId: row.client_id,
    fieldDefId: row.field_def_id,
    valueText: row.value_text ?? null,
    valueNumber: row.value_number ?? null,
  };
}

// ── field definitions ─────────────────────────────────────────────────────────

export function useCustomFieldDefs() {
  return useQuery({
    queryKey: ["crm_custom_field_defs"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_custom_field_defs")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []).map(mapDef) as CustomFieldDef[];
    },
  });
}

export function useCreateCustomFieldDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; fieldType: "text" | "number"; unit?: string }) => {
      const supabase = createClient();
      const { data: profile } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", profile.user!.id)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_custom_field_defs")
        .insert({
          org_id: prof!.org_id,
          name: input.name,
          field_type: input.fieldType,
          unit: input.unit ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapDef(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_custom_field_defs"] }),
  });
}

export function useUpdateCustomFieldDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; unit?: string; sortOrder?: number }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_custom_field_defs")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.unit !== undefined && { unit: input.unit }),
          ...(input.sortOrder !== undefined && { sort_order: input.sortOrder }),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_custom_field_defs"] }),
  });
}

export function useDeleteCustomFieldDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_custom_field_defs")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_custom_field_defs"] }),
  });
}

// ── field values per client ───────────────────────────────────────────────────

export function useClientCustomFieldValues(clientId: string) {
  return useQuery({
    queryKey: ["crm_client_custom_field_values", clientId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_client_custom_field_values")
        .select("*")
        .eq("client_id", clientId);
      if (error) throw error;
      return (data ?? []).map(mapValue) as ClientCustomFieldValue[];
    },
    enabled: !!clientId,
  });
}

export function useUpsertClientCustomFieldValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      clientId: string;
      fieldDefId: string;
      valueText?: string | null;
      valueNumber?: number | null;
    }) => {
      const supabase = createClient();
      const { data: profile } = await supabase.auth.getUser();
      const { data: prof } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", profile.user!.id)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_client_custom_field_values")
        .upsert({
          org_id: prof!.org_id,
          client_id: input.clientId,
          field_def_id: input.fieldDefId,
          value_text: input.valueText ?? null,
          value_number: input.valueNumber ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "client_id,field_def_id" });
      if (error) throw error;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["crm_client_custom_field_values", v.clientId] }),
  });
}
