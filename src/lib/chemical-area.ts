import type { SupabaseClient } from "@supabase/supabase-js";

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

export type ChemicalAreaResolver = (args: ChemicalAreaArgs) => number | undefined;

/**
 * "How much area does this service treat on this job" for the chemical
 * estimate. Order: the job service's own treated area (spot treatment, front
 * lawn only), else the property measurement named by the service's
 * chemical_area_field_id (parking-lot weed control sizes from Parking Lot
 * Sq. Ft.), else the org's Area Custom Field.
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
  const valuesByField = new Map<string, Map<string, number>>();
  const clientValuesByField = new Map<string, Map<string, number>>();
  for (const fieldId of fieldIds) {
    valuesByField.set(fieldId, await fetchPropertyAreaValues(supabase, fieldId, propertyIds));
    clientValuesByField.set(fieldId, await fetchClientAreaValues(supabase, fieldId, clientIds));
  }
  return ({ propertyId, clientId, serviceId, treatedArea }) => {
    if (treatedArea != null && treatedArea > 0) return Number(treatedArea);
    const fieldId = (serviceId ? serviceFieldById.get(serviceId) : undefined) ?? orgAreaFieldId;
    if (!fieldId) return undefined;
    // Property value first, then the client's own value for the same field.
    const onProperty = propertyId ? valuesByField.get(fieldId)?.get(propertyId) : undefined;
    if (onProperty != null) return onProperty;
    return clientId ? clientValuesByField.get(fieldId)?.get(clientId) : undefined;
  };
}
