"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateMatrixRow {
  id: string;
  orgId: string;
  serviceId: string;
  customFieldId: string;
  calcType: 0 | 1;
  fromVal: number;
  toVal: number | null;
  rateCents: number;
  budgetedHours: number;
  budgetedCostCents: number;
  sortOrder: number;
  isTailRow: boolean;
  tailEveryQty: number | null;
  tailOverQty: number | null;
}

export interface PropertyCustomFieldValue {
  id: string;
  propertyId: string;
  fieldDefId: string;
  valueNumber: number | null;
  valueText: string | null;
}

export interface CRMCustomFieldDef {
  id: string;
  orgId: string;
  label: string;
  fieldType: "text" | "number" | "select" | "date";
  entityType: "client" | "property";
  isSystem: boolean;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): RateMatrixRow {
  return {
    id: row.id,
    orgId: row.org_id,
    serviceId: row.service_id,
    customFieldId: row.custom_field_id,
    calcType: row.calc_type as 0 | 1,
    fromVal: Number(row.from_val ?? 0),
    toVal: row.to_val != null ? Number(row.to_val) : null,
    rateCents: row.rate_cents ?? 0,
    budgetedHours: Number(row.budgeted_hours ?? 0),
    budgetedCostCents: row.budgeted_cost_cents ?? 0,
    sortOrder: row.sort_order ?? 0,
    isTailRow: row.is_tail_row ?? false,
    tailEveryQty: row.tail_every_qty != null ? Number(row.tail_every_qty) : null,
    tailOverQty: row.tail_over_qty != null ? Number(row.tail_over_qty) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPropertyFieldValue(row: any): PropertyCustomFieldValue {
  return {
    id: row.id,
    propertyId: row.property_id,
    fieldDefId: row.field_def_id,
    valueNumber: row.value_number != null ? Number(row.value_number) : null,
    valueText: row.value_text ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFieldDef(row: any): CRMCustomFieldDef {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.field_label,
    fieldType: row.field_type,
    entityType: row.entity_type,
    isSystem: row.is_system ?? false,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Fetches all rate matrix rows for a service, ordered by sort_order.
 */
export function useRateMatrix(serviceId: string) {
  return useQuery({
    queryKey: ["rate-matrix", serviceId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_service_rate_matrix")
        .select("*")
        .eq("service_id", serviceId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []).map(mapRow)) as RateMatrixRow[];
    },
    enabled: !!serviceId,
  });
}

/**
 * Insert or update a rate matrix row. Invalidates the rate-matrix query for the service.
 */
export function useUpsertRateMatrixRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serviceId,
      row,
    }: {
      serviceId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row: Record<string, any>;
    }) => {
      const supabase = createClient();
      const { id, ...patch } = row;
      // Editing an existing row must be a real UPDATE. Sending a partial row
      // through upsert() builds an INSERT tuple first, and Postgres checks
      // NOT NULL (custom_field_id) on that tuple before it looks for the
      // conflicting id, so every single-cell edit failed to save.
      const query = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      const { data, error } = id
        ? await query.from("crm_service_rate_matrix").update(patch).eq("id", id).select().single()
        : await query.from("crm_service_rate_matrix").insert({ service_id: serviceId, ...patch }).select().single();
      if (error) throw error;
      return mapRow(data);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["rate-matrix", vars.serviceId] });
    },
  });
}

/**
 * Copy one service's rate matrix to other services. Each target's existing
 * rows are soft-deleted first so the result is an exact copy, and the
 * service-level lookup field / calc mode are carried across with it.
 */
export function useCopyRateMatrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sourceServiceId,
      targetServiceIds,
    }: {
      sourceServiceId: string;
      targetServiceIds: string[];
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: src, error: srcErr } = await db
        .from("crm_service_rate_matrix")
        .select("*")
        .eq("service_id", sourceServiceId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (srcErr) throw srcErr;
      const { data: srcSvc, error: svcErr } = await db
        .from("crm_services")
        .select("rate_matrix_field, rate_matrix_calc")
        .eq("id", sourceServiceId)
        .single();
      if (svcErr) throw svcErr;

      for (const targetId of targetServiceIds) {
        const { error: delErr } = await db
          .from("crm_service_rate_matrix")
          .update({ deleted_at: new Date().toISOString() })
          .eq("service_id", targetId)
          .is("deleted_at", null);
        if (delErr) throw delErr;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const copies = (src ?? []).map((r: any) => ({
          service_id: targetId,
          custom_field_id: r.custom_field_id,
          calc_type: r.calc_type,
          from_val: r.from_val,
          to_val: r.to_val,
          rate_cents: r.rate_cents,
          budgeted_hours: r.budgeted_hours,
          budgeted_cost_cents: r.budgeted_cost_cents,
          sort_order: r.sort_order,
          is_tail_row: r.is_tail_row,
          tail_every_qty: r.tail_every_qty,
          tail_over_qty: r.tail_over_qty,
        }));
        if (copies.length > 0) {
          const { error: insErr } = await db.from("crm_service_rate_matrix").insert(copies);
          if (insErr) throw insErr;
        }
        const { error: updErr } = await db
          .from("crm_services")
          .update({
            rate_matrix_field: srcSvc?.rate_matrix_field ?? null,
            rate_matrix_calc: srcSvc?.rate_matrix_calc ?? "qty_x_rate_x_visits",
          })
          .eq("id", targetId);
        if (updErr) throw updErr;
      }
      return { count: targetServiceIds.length };
    },
    onSuccess: (_d, vars) => {
      for (const id of vars.targetServiceIds) qc.invalidateQueries({ queryKey: ["rate-matrix", id] });
      qc.invalidateQueries({ queryKey: ["crm-services"] });
    },
  });
}

/**
 * Soft-delete a rate matrix row. Invalidates the rate-matrix query for the service.
 */
export function useDeleteRateMatrixRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, serviceId }: { id: string; serviceId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_service_rate_matrix")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { serviceId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["rate-matrix", vars.serviceId] });
    },
  });
}

/**
 * Fetches all custom field values for a property.
 */
export function usePropertyCustomFieldValues(propertyId: string) {
  return useQuery({
    queryKey: ["property-custom-field-values", propertyId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_property_custom_field_values")
        .select("*")
        .eq("property_id", propertyId);
      if (error) throw error;
      return ((data ?? []).map(mapPropertyFieldValue)) as PropertyCustomFieldValue[];
    },
    enabled: !!propertyId,
  });
}

/**
 * Upsert a property custom field value by (property_id, field_def_id).
 */
export function useUpsertPropertyCustomFieldValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      fieldDefId,
      valueNumber,
      valueText,
    }: {
      propertyId: string;
      fieldDefId: string;
      valueNumber?: number | null;
      valueText?: string | null;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_property_custom_field_values")
        .upsert(
          {
            property_id: propertyId,
            field_def_id: fieldDefId,
            value_number: valueNumber ?? null,
            value_text: valueText ?? null,
          },
          { onConflict: "property_id,field_def_id" }
        )
        .select()
        .single();
      if (error) throw error;
      return mapPropertyFieldValue(data);
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["property-custom-field-values", vars.propertyId] });
    },
  });
}

/**
 * Fetches custom field definitions, optionally filtered by entity_type.
 * Only returns non-deleted defs.
 */
export function useCustomFieldDefs(entityType?: "client" | "property") {
  return useQuery({
    queryKey: ["crm-custom-field-defs", entityType ?? "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_rate_matrix_field_defs")
        .select("*")
        .is("deleted_at", null)
        .order("field_label");
      if (entityType) {
        q = q.eq("entity_type", entityType);
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []).map(mapFieldDef)) as CRMCustomFieldDef[];
    },
  });
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Given a set of rate matrix rows and a numeric property value (e.g. turf sq ft),
 * returns the matching row.
 *
 * Matching logic:
 *   1. Find the first non-tail row where fromVal <= value < toVal
 *      (toVal === null means open upper bound — matches anything at or above fromVal).
 *   2. If the value OVERFLOWS every non-tail row's range — i.e. it is at or
 *      above the lowest band but matched none of them — fall back to the tail
 *      row (isTailRow === true), which exists precisely to price the
 *      too-big-for-the-table case.
 *   3. If the value UNDERFLOWS the table (below every row's fromVal), return
 *      null so the caller keeps the service's own flat rate.
 *   4. Returns null if no match is found.
 *
 * Step 3 is the fix for a real mispricing: the tail row used to be returned for
 * anything the bands didn't match, in either direction. With bands
 * [5,000-10,000] and [10,000-infinity], a 3,000 sq ft property fell off the
 * bottom of the table and was handed the overflow-for-the-largest-property
 * rate — $150 where the flat rate would have quoted $360. A value below the
 * smallest band is not an overflow and must never be priced as one; the table
 * simply has nothing to say about it.
 *
 * NOTE: the tail row's tailEveryQty/tailOverQty increment arithmetic ("plus X
 * per every Y units over Z") is still the caller's to apply, and no caller
 * applies it today — there is also no editor UI that can author those two
 * fields, so they are null everywhere. Left alone deliberately rather than
 * guessing at the intended formula for a money calculation.
 */
export function lookupRateMatrixMatch(
  rows: RateMatrixRow[],
  propertyValue: number
): RateMatrixRow | null {
  if (!rows.length) return null;

  const nonTail = rows
    .filter((r) => !r.isTailRow)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const tailRow = rows.find((r) => r.isTailRow) ?? null;

  for (const row of nonTail) {
    const aboveFrom = propertyValue >= row.fromVal;
    // toVal === null means open-ended upper bound
    const belowTo = row.toVal == null || propertyValue < row.toVal;
    if (aboveFrom && belowTo) return row;
  }

  // Below the bottom of the whole table (tail row included) — an underflow,
  // not an overflow. No row applies.
  const lowestFromVal = rows.reduce((min, r) => Math.min(min, r.fromVal), Infinity);
  if (propertyValue < lowestFromVal) return null;

  // Value exceeded all non-tail ranges — return tail row if present
  return tailRow;
}
