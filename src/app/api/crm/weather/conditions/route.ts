import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchConditions } from "@/lib/weather/nws-conditions";

/**
 * GET /api/crm/weather/conditions?lat=..&lng=..[&at=ISO] — what it was (or is) like at a
 * location: temperature, wind speed and direction from the nearest National Weather Service
 * station. Used by the office's chemical application panel to fill the conditions in.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }
  const reading = await fetchConditions(lat, lng, searchParams.get("at") ?? undefined);
  return NextResponse.json({ reading });
}
