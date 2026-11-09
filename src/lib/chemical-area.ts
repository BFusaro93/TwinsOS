import type { SupabaseClient } from "@supabase/supabase-js";
import { areaBasis, type AreaKind } from "@/lib/chemical-mix-calc";
import type { ChemicalApplicationRate, ChemicalLookupItem } from "@/types/chemical-tracking";

// Resolves "how much area does this job treat" for the chemical estimate
// (rate x area), used by the application panel and the load-list /
// materials-needed reports so they can't disagree.
//
// Two gaps this closes, both of which silently produced NO estimate at all:
//
//  1. Built-in takeoff fields. "Turf Sq. Ft." and friends are literal columns
//     on client_properties; the crm_rate_matrix_field_defs row with the
//     matching field_key is just a handle for pickers. Nothing writes
//     crm_property_custom_field_values for it, so an org that chose "Turf Sq.
//     Ft." as its Area Custom Field (the obvious pick) found every property
//     with a value on the property record and none in the table we looked in.
//     An explicit custom-field value still wins when present.
//
//  2. Jobs with no property_id. crm_jobs.property_id is usually null (nobody
//     picks a property when making a job), but the job list already falls back
//     to the client's only property (resolveJobProperty). The chemical paths
//     read property_id directly and so lost the area for the same jobs. Same
//     rule here: exactly one live property -> use it; two or more stays
//     unresolved, because guessing which lawn gets sprayed is worse than
//     showing nothing.

/** field_key -> client_properties column, for takeoff fields stored as columns. */
const BUILT_IN_AREA_COLUMNS: Record<string, string> = {
  turf_sqft: "turf_sqft",
  mulch_bed_sqft: "mulch_bed_sqft",
  gross_sqft: "gross_sqft",
  linear_ft_perimeter: "linear_ft_perimeter",
  linear_ft_edging: "linear_ft_edging",
  yards_of_mulch: "yards_of_mulch",
  parking_lot_sqft: "parking_lot_sqft",
};

const SQUARE_FOOT_RE = /sq\.?\s*f(?:ee)?t|sqft|square\s*f(?:ee|oo)?t|ft²|ft2/i;
const SQUARE_YARD_RE = /sq\.?\s*y(?:ar)?ds?|square\s*yards?|yd²|yd2/i;
const ACRE_RE = /\bacres?\b|\bac\b/i;
const LINEAR_RE = /\blinear\b|\blin\.?\s*f|\bln\.?\s*f|\blf\b|perimeter|edging|running\s*f/i;
const NOT_AREA_RE = /\b(?:yards?|yds?|cubic|cu\.?\s*ft|gallons?|gal|count|each|inch(?:es)?|depth|height|lbs?|pounds?)\b/i;

/** How a property measurement sizes a chemical rate: its kind, and base units (sq ft or ft) per unit of the field. */
export interface FieldMeasure {
  kind: AreaKind;
  factor: number;
}

/**
 * What a property field measures, for sizing a chemical rate — or null when it
 * can't size one at all (Yards of Mulch, a count, a depth). Square feet and
 * acres are areas (acres converted to square feet); Linear Ft. Edging,
 * Perimeter and other running-foot fields are linear and only size a
 * per-linear-foot rate. A mirrored client field is judged by its unit when it
 * has one; otherwise the label decides, and a label that names no unit at all
 * ("Lawn Area") is given the benefit of the doubt as square feet.
 */
export function chemicalFieldMeasure(
  def: { label: string; fieldKey?: string | null; clientFieldDefId?: string | null },
  clientUnitById?: Map<string, string | null>
): FieldMeasure | null {
  const unit = def.clientFieldDefId ? clientUnitById?.get(def.clientFieldDefId)?.trim() : "";
  const text = unit || `${def.label} ${(def.fieldKey ?? "").replace(/_/g, " ")}`;
  if (SQUARE_FOOT_RE.test(text)) return { kind: "area", factor: 1 };
  if (SQUARE_YARD_RE.test(text)) return { kind: "area", factor: 9 };
  if (ACRE_RE.test(text)) return { kind: "area", factor: 43560 };
  if (LINEAR_RE.test(text)) return { kind: "linear", factor: 1 };
  if (NOT_AREA_RE.test(text)) return null;
  return { kind: "area", factor: 1 };
}

/** Whether a property field can size a chemical amount (square feet, acres or linear feet). */
export function isChemicalAreaField(
  def: { label: string; fieldKey?: string | null; clientFieldDefId?: string | null },
  clientUnitById?: Map<string, string | null>
): boolean {
  return chemicalFieldMeasure(def, clientUnitById) != null;
}

/** "sq ft" / "linear ft" for a measurement in base units. */
export function areaKindLabel(kind: AreaKind): string {
  return kind === "linear" ? "linear ft" : "sq ft";
}

/**
 * Why a default rate produced no estimate for a resolved measurement, when the
 * reason is a kind mismatch ("per 100 lin ft" against a square-foot field) —
 * null when the kinds agree.
 */
export function areaKindMismatchHint(
  rate: ChemicalApplicationRate,
  area: ChemicalArea,
  unitsById: Map<string, ChemicalLookupItem>
): string | null {
  const basis = areaBasis(rate.areaUnitId ? unitsById.get(rate.areaUnitId) : undefined);
  if (basis.kind === area.kind) return null;
  return `its rate is per ${areaKindLabel(basis.kind)} but the measurement is in ${areaKindLabel(area.kind)}`;
}

/** True for the takeoff fields stored as literal columns (Turf Sq. Ft., …) rather than as custom values. */
export function isBuiltInAreaKey(fieldKey: string | null | undefined): boolean {
  return !!fieldKey && fieldKey in BUILT_IN_AREA_COLUMNS;
}

interface JobPropertyRef {
  client_id: string | null;
  property_id: string | null;
}

/**
 * The property a job's chemical area comes from: its own property_id, else the
 * client's single live property. `singlePropertyByClient` is built by
 * fetchSinglePropertyByClient.
 */
export function effectivePropertyId(
  job: JobPropertyRef,
  singlePropertyByClient: Map<string, string>
): string | null {
  if (job.property_id) return job.property_id;
  return job.client_id ? singlePropertyByClient.get(job.client_id) ?? null : null;
}

/** client_id -> property_id for every client that owns exactly one live property. */
export async function fetchSinglePropertyByClient(
  supabase: SupabaseClient,
  clientIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const { data } = await supabase
    .from("client_properties")
    .select("id, client_id")
    .in("client_id", ids)
    .is("deleted_at", null);
  const byClient = new Map<string, string[]>();
  for (const row of (data ?? []) as { id: string; client_id: string }[]) {
    const list = byClient.get(row.client_id) ?? [];
    list.push(row.id);
    byClient.set(row.client_id, list);
  }
  for (const [clientId, propertyIds] of byClient) {
    if (propertyIds.length === 1) out.set(clientId, propertyIds[0]);
  }
  return out;
}

/** property_id -> area value for the org's configured Area Custom Field. */
export async function fetchPropertyAreaValues(
  supabase: SupabaseClient,
  areaFieldId: string | null,
  propertyIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(propertyIds.filter(Boolean))];
  if (!areaFieldId || ids.length === 0) return out;

  const { data: values } = await supabase
    .from("crm_property_custom_field_values")
    .select("property_id, value_number")
    .eq("field_def_id", areaFieldId)
    .in("property_id", ids);
  for (const fv of (values ?? []) as { property_id: string; value_number: number | null }[]) {
    if (fv.value_number != null) out.set(fv.property_id, Number(fv.value_number));
  }

  const missing = ids.filter((id) => !out.has(id));
  if (missing.length === 0) return out;

  const { data: def } = await supabase
    .from("crm_rate_matrix_field_defs")
    .select("field_key")
    .eq("id", areaFieldId)
    .maybeSingle();
  const column = def ? BUILT_IN_AREA_COLUMNS[(def as { field_key: string }).field_key] : undefined;
  if (!column) return out;

  const { data: props } = await supabase.from("client_properties").select(`id, ${column}`).in("id", missing);
  for (const row of (props ?? []) as unknown as Record<string, unknown>[]) {
    const v = row[column];
    if (v != null) out.set(row.id as string, Number(v));
  }
  return out;
}

/**
 * client_id -> value for an area/lookup field, at the CLIENT level: the linked
 * client custom field when the property def mirrors one (client_field_def_id),
 * else the built-in takeoff column on `clients`. Property-only custom fields
 * have no client counterpart and return nothing.
 */
export async function fetchClientAreaValues(
  supabase: SupabaseClient,
  fieldId: string | null,
  clientIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!fieldId || ids.length === 0) return out;

  const { data: def } = await supabase
    .from("crm_rate_matrix_field_defs")
    .select("field_key, client_field_def_id")
    .eq("id", fieldId)
    .maybeSingle();
  if (!def) return out;
  const { field_key: fieldKey, client_field_def_id: clientFieldDefId } = def as {
    field_key: string;
    client_field_def_id: string | null;
  };

  if (clientFieldDefId) {
    const { data: values } = await supabase
      .from("crm_client_custom_field_values")
      .select("client_id, value_number")
      .eq("field_def_id", clientFieldDefId)
      .in("client_id", ids);
    for (const row of (values ?? []) as { client_id: string; value_number: number | null }[]) {
      if (row.value_number != null) out.set(row.client_id, Number(row.value_number));
    }
    return out;
  }

  const column = BUILT_IN_AREA_COLUMNS[fieldKey];
  if (!column) return out;
  const { data: rows } = await supabase.from("clients").select(`id, ${column}`).in("id", ids);
  for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
    const v = row[column];
    if (v != null) out.set(row.id as string, Number(v));
  }
  return out;
}

/** The value of a lookup field for a property, falling back to its client. */
export async function fetchFieldValueWithClientFallback(
  supabase: SupabaseClient,
  fieldId: string | null,
  propertyId: string | null,
  clientId: string | null
): Promise<number | null> {
  if (!fieldId) return null;
  if (propertyId) {
    const byProperty = await fetchPropertyAreaValues(supabase, fieldId, [propertyId]);
    const v = byProperty.get(propertyId);
    if (v != null) return v;
  }
  if (clientId) {
    const byClient = await fetchClientAreaValues(supabase, fieldId, [clientId]);
    return byClient.get(clientId) ?? null;
  }
  return null;
}

export interface ChemicalAreaArgs {
  propertyId: string | null;
  /** Used when the property has no value (or there is no property): the client's value for the same field. */
  clientId?: string | null;
  serviceId: string | null;
  /** crm_job_services.treated_area — what this job actually treats. */
  treatedArea?: number | null;
}

/** A resolved measurement: the value in base units (sq ft, or ft for linear) and what it measures. */
export interface ChemicalArea {
  value: number;
  kind: AreaKind;
}

export type ChemicalAreaResolver = (args: ChemicalAreaArgs) => ChemicalArea | undefined;

/**
 * "How much area does this service treat on this job" for the chemical
 * estimate. Order: the job service's own treated area (spot treatment, front
 * lawn only), else the property measurement named by the service's
 * chemical_area_field_id (parking-lot weed control sizes from Parking Lot
 * Sq. Ft.), else the org's Area Custom Field.
 *
 * The result carries its kind so a per-linear-foot rate only sizes against a
 * linear-foot field. A treated-area override is in the same kind of unit as
 * the field the service would otherwise size from (linear feet for a
 * perimeter service), square feet when there is no field.
 */
export async function buildChemicalAreaResolver(
  supabase: SupabaseClient,
  orgAreaFieldId: string | null,
  serviceIds: string[],
  propertyIds: string[],
  clientIds: string[] = []
): Promise<ChemicalAreaResolver> {
  const ids = [...new Set(serviceIds.filter(Boolean))];
  const serviceFieldById = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase.from("crm_services").select("id, chemical_area_field_id").in("id", ids);
    for (const row of (data ?? []) as { id: string; chemical_area_field_id: string | null }[]) {
      if (row.chemical_area_field_id) serviceFieldById.set(row.id, row.chemical_area_field_id);
    }
  }
  const fieldIds = [...new Set([...(orgAreaFieldId ? [orgAreaFieldId] : []), ...serviceFieldById.values()])];
  const measureByField = await fetchFieldMeasures(supabase, fieldIds);
  const valuesByField = new Map<string, Map<string, number>>();
  const clientValuesByField = new Map<string, Map<string, number>>();
  for (const fieldId of fieldIds) {
    valuesByField.set(fieldId, await fetchPropertyAreaValues(supabase, fieldId, propertyIds));
    clientValuesByField.set(fieldId, await fetchClientAreaValues(supabase, fieldId, clientIds));
  }
  return ({ propertyId, clientId, serviceId, treatedArea }) => {
    const fieldId = (serviceId ? serviceFieldById.get(serviceId) : undefined) ?? orgAreaFieldId;
    const measure = fieldId ? measureByField.get(fieldId) : undefined;
    if (treatedArea != null && treatedArea > 0) {
      return { value: Number(treatedArea), kind: measure?.kind ?? "area" };
    }
    // A field that can't size a rate (Yards of Mulch) gives no estimate rather than a wrong one.
    if (!fieldId || !measure) return undefined;
    // Property value first, then the client's own value for the same field.
    const onProperty = propertyId ? valuesByField.get(fieldId)?.get(propertyId) : undefined;
    const raw = onProperty ?? (clientId ? clientValuesByField.get(fieldId)?.get(clientId) : undefined);
    return raw == null ? undefined : { value: raw * measure.factor, kind: measure.kind };
  };
}

/** field id -> what it measures, read from the def's label/key or its mirrored client field's unit. */
async function fetchFieldMeasures(supabase: SupabaseClient, fieldIds: string[]): Promise<Map<string, FieldMeasure>> {
  const out = new Map<string, FieldMeasure>();
  if (fieldIds.length === 0) return out;
  const { data: defs } = await supabase
    .from("crm_rate_matrix_field_defs")
    .select("id, field_key, field_label, client_field_def_id")
    .in("id", fieldIds);
  const rows = (defs ?? []) as { id: string; field_key: string; field_label: string; client_field_def_id: string | null }[];
  const clientIds = rows.map((r) => r.client_field_def_id).filter(Boolean) as string[];
  const clientUnitById = new Map<string, string | null>();
  if (clientIds.length > 0) {
    const { data: clientDefs } = await supabase.from("crm_custom_field_defs").select("id, unit").in("id", clientIds);
    for (const d of (clientDefs ?? []) as { id: string; unit: string | null }[]) clientUnitById.set(d.id, d.unit);
  }
  for (const r of rows) {
    const measure = chemicalFieldMeasure(
      { label: r.field_label, fieldKey: r.field_key, clientFieldDefId: r.client_field_def_id },
      clientUnitById
    );
    if (measure) out.set(r.id, measure);
  }
  return out;
}

/**
 * service_id -> what its treated-area override is measured in: linear feet for a
 * service that sizes from a linear-foot field (Perimeter, Edging), square feet
 * otherwise — the same rule buildChemicalAreaResolver applies to the override.
 */
export async function fetchServiceAreaKinds(
  supabase: SupabaseClient,
  orgAreaFieldId: string | null,
  serviceIds: string[]
): Promise<Map<string, AreaKind>> {
  const out = new Map<string, AreaKind>();
  const ids = [...new Set(serviceIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const { data } = await supabase.from("crm_services").select("id, chemical_area_field_id").in("id", ids);
  const fieldByService = new Map<string, string | null>();
  for (const row of (data ?? []) as { id: string; chemical_area_field_id: string | null }[]) {
    fieldByService.set(row.id, row.chemical_area_field_id ?? orgAreaFieldId);
  }
  const fieldIds = [...new Set([...fieldByService.values()].filter(Boolean))] as string[];
  const measures = await fetchFieldMeasures(supabase, fieldIds);
  for (const id of ids) {
    const fieldId = fieldByService.get(id) ?? orgAreaFieldId;
    out.set(id, (fieldId ? measures.get(fieldId)?.kind : undefined) ?? "area");
  }
  return out;
}
