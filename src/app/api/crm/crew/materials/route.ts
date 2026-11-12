import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { resolveCallerCrewId } from "@/lib/supabase/crew-id";
import { createServiceClient } from "@/lib/supabase/server";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { getCrewMaterials } from "@/lib/crew/crew-load";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

/**
 * GET /api/crm/crew/materials?date=YYYY-MM-DD
 *
 * The materials (mulch, bagged fertilizer, …) the caller's crew still has to load for the
 * day's dispatched stops, summed per product, each with whether the crew has checked it off.
 * Chemicals are excluded — they have their own preload step. See getCrewMaterials().
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

  const crewId = await resolveCallerCrewId(supabase, user.id, orgId);
  if (!crewId) return NextResponse.json({ date, items: [] });

  try {
    const items = await getCrewMaterials(db, createServiceClient() as AnyDb, orgId, crewId, date);
    return NextResponse.json({ date, items });
  } catch {
    return NextResponse.json({ error: "Could not load materials" }, { status: 500 });
  }
}
