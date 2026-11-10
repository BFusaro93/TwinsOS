import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { equipmentRank } from "@/lib/equipment-order";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

interface Row { crew_id: string | null; asset_id: string | null; vehicle_id: string | null }
const keyOf = (r: Row) => (r.vehicle_id ? `vehicle:${r.vehicle_id}` : `asset:${r.asset_id}`);

/**
 * GET /api/crm/crew/equipment?date=YYYY-MM-DD
 *
 * The trucks, trailers and equipment the office put on the caller's crew for the day (the
 * crew board's drag-and-drop). Same rule as the board: a day's crm_crew_daily_assets row
 * wins (a null crew means "off every crew today"), else the item's default crew.
 * Read with the service client — crew logins don't hold SELECT on these tables — but only
 * the caller's own crew's items are returned, in the caller's own org.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabase as AnyDb;
  const { data: profile } = await db.from("profiles").select("org_id").eq("id", user.id).single();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  const tz = await getMyTimeZone(supabase);
  const dateParam = new URL(request.url).searchParams.get("date");
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayInZone(tz);

  // Same crew lookup as GET /api/crm/crew/visits.
  const { data: crewRows } = await db
    .from("crm_crews").select("id").eq("user_id", user.id).eq("org_id", orgId).is("deleted_at", null)
    .order("created_at", { ascending: true }).limit(1);
  const crewId = ((crewRows ?? []) as { id: string }[])[0]?.id ?? null;
  if (!crewId) return NextResponse.json({ date, items: [] });

  const admin = createServiceClient() as AnyDb;
  const [{ data: daily, error: dErr }, { data: defaults, error: fErr }] = await Promise.all([
    admin.from("crm_crew_daily_assets").select("crew_id, asset_id, vehicle_id").eq("org_id", orgId).eq("work_date", date),
    admin.from("crm_crew_default_assets").select("crew_id, asset_id, vehicle_id").eq("org_id", orgId),
  ]);
  if (dErr || fErr) return NextResponse.json({ error: "Could not load equipment" }, { status: 500 });

  const crewOf = new Map<string, string | null>();
  for (const r of (defaults ?? []) as Row[]) crewOf.set(keyOf(r), r.crew_id);
  for (const r of (daily ?? []) as Row[]) crewOf.set(keyOf(r), r.crew_id); // the day's row overrides the default

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

  type Item = { id: string; kind: "asset" | "vehicle"; name: string; tag: string | null; type: string | null; rank: number };
  const toItem = (kind: "asset" | "vehicle") => (r: { id: string; name: string; asset_tag: string | null; asset_type: string | null }): Item =>
    ({ id: r.id, kind, name: r.name, tag: r.asset_tag, type: r.asset_type, rank: equipmentRank(kind, r.asset_type).rank });
  const items = [
    ...((vehicles.data ?? []) as Parameters<ReturnType<typeof toItem>>[0][]).map(toItem("vehicle")),
    ...((assets.data ?? []) as Parameters<ReturnType<typeof toItem>>[0][]).map(toItem("asset")),
  ].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  return NextResponse.json({ date, items });
}
