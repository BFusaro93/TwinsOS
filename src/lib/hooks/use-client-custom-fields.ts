"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
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

// ── property field definitions ────────────────────────────────────────────────

/**
 * Takeoff/custom fields that live on a PROPERTY, not on a client.
 *
 * These are a different table from the client-level defs above:
 * `crm_property_custom_field_values.field_def_id` points at
 * `crm_rate_matrix_field_defs` (the same defs the estimating Rate Matrix keys
 * off), while `crm_client_custom_field_values.field_def_id` points at
 * `crm_custom_field_defs`. The dispatch board and waiting list used to render
 * their property columns from the client-level def list, so no property value
 * could ever match a def id and every custom takeoff column was permanently
 * blank.
 */
export interface PropertyCustomFieldDef {
  id: string;
  /** `crm_rate_matrix_field_defs.field_key` — stable identifier, e.g. "turf_sqft". */
  fieldKey: string;
  /** Display label, e.g. "Turf Sq. Ft.". */
  name: string;
  fieldType: "text" | "number" | "select" | "date";
  sortOrder: number;
}

/**
 * Property field keys that the dispatch board / waiting list already render as
 * dedicated built-in columns straight off `client_properties`. Every org is
 * seeded with a matching def row (so the Rate Matrix can price off them), and
 * offering both would list e.g. "Turf Sq. Ft." twice in the column chooser —
 * once backed by the real column, once by an all-but-empty values table.
 */
const BUILT_IN_TAKEOFF_FIELD_KEYS = new Set([
  "turf_sqft",
  "mulch_bed_sqft",
  "gross_sqft",
  "linear_ft_perimeter",
  "linear_ft_edging",
  "yards_of_mulch",
  "parking_lot_sqft",
]);

/**
 * The org's genuinely custom property fields — i.e. the property defs that are
 * NOT already a built-in takeoff column. These are what the dispatch board and
 * waiting list offer as extra "custom:<id>" columns.
 */
export function usePropertyCustomFieldDefs() {
  return useQuery({
    queryKey: ["crm_rate_matrix_field_defs", "property", "custom-only"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_rate_matrix_field_defs")
        .select("id, field_key, field_label, field_type, sort_order")
        .eq("entity_type", "property")
        .is("deleted_at", null)
        .order("sort_order")
        .order("field_label");
      if (error) throw error;
      return (data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((row: any) => !BUILT_IN_TAKEOFF_FIELD_KEYS.has(row.field_key))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((row: any): PropertyCustomFieldDef => ({
          id: row.id,
          fieldKey: row.field_key,
          name: row.field_label,
          fieldType: row.field_type,
          sortOrder: row.sort_order ?? 0,
        })) as PropertyCustomFieldDef[];
    },
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

/** Every client's custom field values in one query, for bulk filtering (e.g.
 *  the Sales Campaigns audience filter) rather than one row at a time. */
export function useAllClientCustomFieldValues() {
  return useQuery({
    queryKey: ["crm_client_custom_field_values", "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_client_custom_field_values")
        .select("*");
      if (error) throw error;
      return (data ?? []).map(mapValue) as ClientCustomFieldValue[];
    },
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
