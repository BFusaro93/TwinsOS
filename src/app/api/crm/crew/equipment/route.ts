import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { resolveCallerCrewId } from "@/lib/supabase/crew-id";
import { createServiceClient } from "@/lib/supabase/server";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { getCrewEquipment } from "@/lib/crew/crew-load";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

/**
 * GET /api/crm/crew/equipment?date=YYYY-MM-DD
 *
 * The trucks, trailers and equipment the office put on the caller's crew for the day (the
 * crew board's drag-and-drop), each with whether the crew has checked it off as loaded
 * (crm_crew_load_checks). Same rule as the board: a day's crm_crew_daily_assets row
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

  const crewId = await resolveCallerCrewId(supabase, user.id, orgId);
  if (!crewId) return NextResponse.json({ date, items: [] });

  try {
    const items = await getCrewEquipment(createServiceClient() as AnyDb, orgId, crewId, date);
    return NextResponse.json({ date, items });
  } catch {
    return NextResponse.json({ error: "Could not load equipment" }, { status: 500 });
  }
}
