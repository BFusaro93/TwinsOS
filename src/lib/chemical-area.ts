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
//
//  3. Clients with no property rows. A job with no property_id is for the
//     client's own address, whose measurements live on the client record, so
//     when no property supplies a value the client's own value is used
//     (fetchClientAreaValues).

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
 * client_id -> the client's OWN area value for the configured Area Custom Field.
 *
 * A job with no property_id is for the client's own address (that's what the New
 * Job dialog's default "client" choice stores), and the measurements entered on the
 * client record ("Property Details" on its Details tab) describe that address. When
 * the job has no property row with a value — including a client who has two
 * properties and a job tied to neither — these are the numbers to use, so the
 * office isn't made to re-enter the client's measurements as a property.
 * Built-in takeoffs come from the client's measurement columns; a custom field the org
 * created comes from the client's custom value (crm_client_custom_field_values), which
 * a property's own value (fetchPropertyAreaValues) overrides.
 */
export async function fetchClientAreaValues(
  supabase: SupabaseClient,
  areaFieldId: string | null,
  clientIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(clientIds.filter(Boolean))];
  if (!areaFieldId || ids.length === 0) return out;

  const { data: def } = await supabase
    .from("crm_rate_matrix_field_defs")
    .select("field_key")
    .eq("id", areaFieldId)
    .maybeSingle();
  const column = def ? BUILT_IN_AREA_COLUMNS[(def as { field_key: string }).field_key] : undefined;
  if (!column) {
    // A custom field the org made (mirrored into the rate-matrix defs under the same id):
    // the client's value is the default every property starts from.
    const { data: custom } = await supabase
      .from("crm_client_custom_field_values")
      .select("client_id, value_number")
      .eq("field_def_id", areaFieldId)
      .in("client_id", ids);
    for (const row of (custom ?? []) as { client_id: string; value_number: number | null }[]) {
      if (row.value_number != null) out.set(row.client_id, Number(row.value_number));
    }
    return out;
  }

  const { data: rows } = await supabase.from("clients").select(`id, ${column}`).in("id", ids);
  for (const row of (rows ?? []) as unknown as Record<string, unknown>[]) {
    const v = row[column];
    if (v != null) out.set(row.id as string, Number(v));
  }
  return out;
}
