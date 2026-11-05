import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchConditions } from "@/lib/weather/nws-conditions";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";

/**
 * GET /api/crm/weather/conditions?lat=..&lng=..[&at=ISO] — what it was (or is) like at a
 * location: temperature, wind speed and direction from the nearest National Weather Service
 * station. Used by the office's chemical application panel to fill the conditions in.
 *
 * Landscapt staff and crews only (portal customers and Equipt-only logins have no use for it),
 * and rate-limited per user: each call fans out to up to six NWS requests.
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
  // has_crm_access() is true for admins, crew logins and anyone holding an active CRM role.
  const { data: hasCrmAccess } = await supabase.rpc("has_crm_access");
  if (hasCrmAccess !== true) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await checkAuthRateLimit(`weather-conditions:user:${user.id}`, 30, 60))) {
    return NextResponse.json({ error: "Too many weather lookups — try again in a minute." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }
  const reading = await fetchConditions(lat, lng, searchParams.get("at") ?? undefined);
  return NextResponse.json({ reading });
}
