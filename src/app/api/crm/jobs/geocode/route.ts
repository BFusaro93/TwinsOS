import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

interface GeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { jobIds: string[] };
  const { jobIds } = body;
  if (!jobIds || jobIds.length === 0) {
    return NextResponse.json({ error: "jobIds is required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const sb = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: org } = await sb
    .from("organizations")
    .select("customizations")
    .eq("id", profile.org_id)
    .single();

  const apiKey = (org?.customizations as Record<string, unknown>)?.google_maps_api_key as string | undefined;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google Maps API key not configured. Add it in Settings → Integrations." },
      { status: 422 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobs } = await (sb as any)
    .from("crm_jobs")
    .select("id, lat, lng, service_address, service_city, service_state, service_zip")
    .in("id", jobIds)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null);

  type JobRow = { id: string; lat: number | null; lng: number | null; service_address: string | null; service_city: string | null; service_state: string | null; service_zip: string | null };
  const results: { id: string; lat: number; lng: number }[] = [];

  for (const job of (jobs ?? []) as JobRow[]) {
    if (job.lat != null && job.lng != null) {
      results.push({ id: job.id, lat: job.lat, lng: job.lng });
      continue;
    }
    const address = [job.service_address, job.service_city, job.service_state, job.service_zip]
      .filter(Boolean)
      .join(", ");
    if (!address) continue;

    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json() as GeocodeResponse;
      const location = geoData.status === "OK" ? geoData.results[0]?.geometry?.location : null;
      if (!location) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any)
        .from("crm_jobs")
        .update({ lat: location.lat, lng: location.lng })
        .eq("id", job.id);

      results.push({ id: job.id, lat: location.lat, lng: location.lng });
    } catch {
      // Skip — a single failed geocode shouldn't fail the whole batch
    }
  }

  return NextResponse.json({ results });
}
