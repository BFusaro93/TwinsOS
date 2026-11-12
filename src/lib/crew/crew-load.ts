import { equipmentRank } from "@/lib/equipment-order";
import { isUndispatchedVisit, selectEffectiveCrewVisits } from "@/lib/supabase/crew-id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

/**
 * What a crew loads on the truck for a day, and which of it they've checked off.
 *
 * Two lists, one key space (see crm_crew_load_checks.item_key):
 *  - equipment: the trucks / trailers / tools the office put on the crew (crew board) —
 *    'vehicle:<id>' / 'asset:<id>'
 *  - materials: the day's general (non-chemical) job products — 'product:<id>'. Chemicals
 *    are not here: they have their own preload step in the crew app's chemical flow.
 *
 * Callers pass a service client for the cross-table reads (crew logins can't read most of
 * these tables); every query here is scoped by an explicit org_id.
 */

export interface CrewEquipmentRow {
  id: string;
  kind: "asset" | "vehicle";
  key: string;
  name: string;
  tag: string | null;
  type: string | null;
  rank: number;
  loaded: boolean;
}

export interface CrewMaterialRow {
  key: string;
  productId: string;
  name: string;
  qty: number;
  /** Client names of the stops this material is for. */
  stops: string[];
  loaded: boolean;
}

interface AssetRow { crew_id: string | null; asset_id: string | null; vehicle_id: string | null }
const keyOf = (r: AssetRow) => (r.vehicle_id ? `vehicle:${r.vehicle_id}` : `asset:${r.asset_id}`);

/** Keys the crew has checked off for the day. */
export async function getLoadedKeys(admin: AnyDb, orgId: string, crewId: string, date: string): Promise<Map<string, string>> {
  const { data } = await admin
    .from("crm_crew_load_checks")
    .select("item_key, loaded_at")
    .eq("org_id", orgId)
    .eq("crew_id", crewId)
    .eq("work_date", date);
  return new Map(((data ?? []) as { item_key: string; loaded_at: string }[]).map((r) => [r.item_key, r.loaded_at]));
}

/** Same rule as the crew board: a day's crm_crew_daily_assets row wins (null crew = off every crew), else the default crew. */
export async function getCrewEquipment(admin: AnyDb, orgId: string, crewId: string, date: string): Promise<CrewEquipmentRow[]> {
  const [{ data: daily, error: dErr }, { data: defaults, error: fErr }, loaded] = await Promise.all([
    admin.from("crm_crew_daily_assets").select("crew_id, asset_id, vehicle_id").eq("org_id", orgId).eq("work_date", date),
    admin.from("crm_crew_default_assets").select("crew_id, asset_id, vehicle_id").eq("org_id", orgId),
    getLoadedKeys(admin, orgId, crewId, date),
  ]);
  if (dErr || fErr) throw new Error("Could not load equipment");

  const crewOf = new Map<string, string | null>();
  for (const r of (defaults ?? []) as AssetRow[]) crewOf.set(keyOf(r), r.crew_id);
  for (const r of (daily ?? []) as AssetRow[]) crewOf.set(keyOf(r), r.crew_id);

  const assetIds: string[] = [];
  const vehicleIds: string[] = [];
  for (const [key, c] of crewOf) {
    if (c !== crewId) continue;
    const [kind, id] = key.split(":");
    (kind === "vehicle" ? vehicleIds : assetIds).push(id);
  }

  const cols = "id, name, asset_tag, asset_type";
  const [assets, vehicles] = await Promise.all([
    assetIds.length ? admin.from("assets").select(cols).eq("org_id", orgId).is("deleted_at", null).in("id", assetIds) : { data: [] },
    vehicleIds.length ? admin.from("vehicles").select(cols).eq("org_id", orgId).is("deleted_at", null).in("id", vehicleIds) : { data: [] },
  ]);

  type Raw = { id: string; name: string; asset_tag: string | null; asset_type: string | null };
  const toItem = (kind: "asset" | "vehicle") => (r: Raw): CrewEquipmentRow => ({
    id: r.id,
    kind,
    key: `${kind}:${r.id}`,
    name: r.name,
    tag: r.asset_tag,
    type: r.asset_type,
    rank: equipmentRank(kind, r.asset_type).rank,
    loaded: loaded.has(`${kind}:${r.id}`),
  });
  return [
    ...((vehicles.data ?? []) as Raw[]).map(toItem("vehicle")),
    ...((assets.data ?? []) as Raw[]).map(toItem("asset")),
  ].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}

const LIVE_VISIT_STATUSES = new Set(["dispatched", "in_progress"]);
const DEAD_JOB_STATUSES = new Set(["cancelled", "completed", "hold"]);

/**
 * Materials still to load for the crew's stops today — pending, non-chemical job products,
 * summed per product. Mirrors the dashboard Daily Load List's general-materials branch
 * (src/lib/reports/materials/daily-load-list.ts): the crew's visits by effective crew, a
 * product row counts when it is job-level or belongs to one of today's visits.
 *
 * `userDb` is the caller's own client (crew can read their visits/jobs through RLS, the same
 * read /api/crm/crew/visits does); `admin` reads the price-bearing crm_job_products.
 */
export async function getCrewMaterials(
  userDb: AnyDb,
  admin: AnyDb,
  orgId: string,
  crewId: string,
  date: string
): Promise<CrewMaterialRow[]> {
  const { data: visitRows, error } = await selectEffectiveCrewVisits(
    userDb,
    "id, job_id, status, job_service_id, crew_group_id, clients(display_name), crm_jobs:crew_job(crew_id, job_type, status)",
    crewId,
    (q) => q.eq("org_id", orgId).eq("scheduled_date", date).is("deleted_at", null)
  );
  if (error) throw new Error(error.message);

  const visits = visitRows.filter((v) => {
    if (!LIVE_VISIT_STATUSES.has(v.status as string)) return false;
    if (isUndispatchedVisit(v)) return false;
    const jobStatus = (v.crm_jobs as { status?: string | null } | null)?.status;
    return !jobStatus || !DEAD_JOB_STATUSES.has(jobStatus);
  });
  if (visits.length === 0) return [];

  const jobIds = [...new Set(visits.map((v) => v.job_id as string))];
  const clientByJob = new Map<string, string>();
  for (const v of visits) {
    const name = (v.clients as { display_name: string | null } | null)?.display_name;
    if (name && !clientByJob.has(v.job_id as string)) clientByJob.set(v.job_id as string, name);
  }

  // Per-visit rows may sit on the stop's lead visit, which can belong to a partner crew.
  const allowedVisitIds = new Set(visits.map((v) => v.id as string));
  const groupIds = [...new Set(visits.map((v) => v.crew_group_id as string | null).filter((g): g is string => !!g))];
  if (groupIds.length > 0) {
    const { data: groupVisits } = await admin
      .from("crm_job_visits").select("id").eq("org_id", orgId).in("crew_group_id", groupIds).is("deleted_at", null);
    for (const g of (groupVisits ?? []) as { id: string }[]) allowedVisitIds.add(g.id);
  }

  const { data: products, error: pErr } = await admin
    .from("crm_job_products")
    .select("product_id, product_name, qty, job_id, visit_id, product_items:product_id(name, track_chemicals)")
    .eq("org_id", orgId)
    .in("job_id", jobIds)
    .eq("status", "pending")
    .is("deleted_at", null)
    .not("product_id", "is", null);
  if (pErr) throw new Error(pErr.message);

  const loaded = await getLoadedKeys(admin, orgId, crewId, date);
  const byProduct = new Map<string, CrewMaterialRow>();
  type P = {
    product_id: string; product_name: string; qty: number; job_id: string; visit_id: string | null;
    product_items: { name: string | null; track_chemicals: boolean | null } | null;
  };
  for (const p of (products ?? []) as P[]) {
    if (p.product_items?.track_chemicals) continue;
    if (p.visit_id && !allowedVisitIds.has(p.visit_id)) continue;
    const key = `product:${p.product_id}`;
    const row = byProduct.get(key) ?? {
      key, productId: p.product_id, name: p.product_items?.name ?? p.product_name, qty: 0, stops: [], loaded: loaded.has(key),
    };
    row.qty += Number(p.qty);
    const stop = clientByJob.get(p.job_id);
    if (stop && !row.stops.includes(stop)) row.stops.push(stop);
    byProduct.set(key, row);
  }
  return [...byProduct.values()]
    .map((r) => ({ ...r, qty: Math.round(r.qty * 10000) / 10000, stops: r.stops.sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
