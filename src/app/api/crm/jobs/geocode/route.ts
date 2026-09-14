import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

/**
 * POST /api/crm/jobs/geocode — resolves lat/lng for a batch of the org's jobs
 * using the org's saved Google Maps key (Settings → Integrations).
 *
 * Address resolution order per job (E-19 — jobs created from the New Job or
 * Convert Estimate dialogs carry no service_address snapshot, so the old
 * job-only lookup never fired a single Google request):
 *   1. cached crm_jobs.lat/lng
 *   2. crm_jobs.service_address
 *   3. the linked client_properties row (crm_jobs.property_id)
 *   4. the client's service address, then billing address
 * Coordinates are cached back onto crm_jobs (and onto the client / property
 * row they came from, best-effort). Google-side failures (REQUEST_DENIED,
 * OVER_QUERY_LIMIT, ...) are reported in `googleError` instead of being
 * swallowed into "no geocodable address".
 */

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

type AddressParts = {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type JobRow = {
  id: string;
  lat: number | null;
  lng: number | null;
  property_id: string | null;
  client_id: string;
  service_address: string | null;
  service_city: string | null;
  service_state: string | null;
  service_zip: string | null;
};

type PropertyRow = { id: string; address: string | null; city: string | null; state: string | null; zip: string | null; lat?: number | null; lng?: number | null };
type ClientRow = {
  id: string;
  service_address: string | null; service_city: string | null; service_state: string | null; service_zip: string | null;
  billing_address: string | null; billing_city: string | null; billing_state: string | null; billing_zip: string | null;
  lat?: number | null; lng?: number | null;
};

type ResolvedAddress = {
  text: string;
  source: "job" | "property" | "client_service" | "client_billing";
  sourceId: string;
  cached: { lat: number; lng: number } | null;
};

function joinAddress(p: AddressParts): string {
  // A bare city/state with no street is not worth a paid lookup.
  if (!p.address?.trim()) return "";
  return [p.address, p.city, p.state, p.zip].map((s) => s?.trim()).filter(Boolean).join(", ");
}

/** Statuses that mean "Google itself refused/failed", as opposed to "this address is unknown". */
const GOOGLE_FAILURE_STATUSES = new Set(["REQUEST_DENIED", "OVER_QUERY_LIMIT", "OVER_DAILY_LIMIT", "INVALID_REQUEST", "UNKNOWN_ERROR"]);

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { jobIds?: unknown };
  const jobIds = Array.isArray(body.jobIds) ? body.jobIds.filter((v): v is string => typeof v === "string") : [];
  if (jobIds.length === 0) {
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

  const apiKey = (org?.customizations as Record<string, unknown> | null)?.google_maps_api_key as string | undefined;
  if (!apiKey?.trim()) {
    return NextResponse.json(
      { error: "Google Maps API key not configured. Add it in Settings → Integrations → Google Maps." },
      { status: 422 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobsData, error: jobsError } = await (sb as any)
    .from("crm_jobs")
    .select("id, lat, lng, property_id, client_id, service_address, service_city, service_state, service_zip")
    .in("id", jobIds)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null);
  if (jobsError) return NextResponse.json({ error: jobsError.message }, { status: 500 });
  const jobs = (jobsData ?? []) as JobRow[];

  // Fallback sources, fetched in bulk. lat/lng on clients / client_properties
  // arrive with migration 20260906190001 — select("*")-free explicit lists
  // would 400 on an un-migrated DB, so read them permissively and treat a
  // missing column as "not cached".
  const propertyIds = Array.from(new Set(jobs.map((j) => j.property_id).filter((v): v is string => !!v)));
  const clientIds = Array.from(new Set(jobs.map((j) => j.client_id).filter(Boolean)));

  const propertiesById = new Map<string, PropertyRow>();
  if (propertyIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from("client_properties")
      .select("*")
      .in("id", propertyIds)
      .eq("org_id", profile.org_id)
      .is("deleted_at", null);
    for (const p of (data ?? []) as PropertyRow[]) propertiesById.set(p.id, p);
  }
  const clientsById = new Map<string, ClientRow>();
  if (clientIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sb as any)
      .from("clients")
      .select("*")
      .in("id", clientIds)
      .eq("org_id", profile.org_id)
      .is("deleted_at", null);
    for (const c of (data ?? []) as ClientRow[]) clientsById.set(c.id, c);
  }

  function resolveAddress(job: JobRow): ResolvedAddress | null {
    const jobText = joinAddress({ address: job.service_address, city: job.service_city, state: job.service_state, zip: job.service_zip });
    if (jobText) return { text: jobText, source: "job", sourceId: job.id, cached: null };

    const property = job.property_id ? propertiesById.get(job.property_id) : undefined;
    if (property) {
      const text = joinAddress(property);
      if (text) {
        const cached = property.lat != null && property.lng != null ? { lat: property.lat, lng: property.lng } : null;
        return { text, source: "property", sourceId: property.id, cached };
      }
    }

    const client = clientsById.get(job.client_id);
    if (client) {
      const cached = client.lat != null && client.lng != null ? { lat: client.lat, lng: client.lng } : null;
      const serviceText = joinAddress({ address: client.service_address, city: client.service_city, state: client.service_state, zip: client.service_zip });
      if (serviceText) return { text: serviceText, source: "client_service", sourceId: client.id, cached };
      const billingText = joinAddress({ address: client.billing_address, city: client.billing_city, state: client.billing_state, zip: client.billing_zip });
      if (billingText) return { text: billingText, source: "client_billing", sourceId: client.id, cached };
    }
    return null;
  }

  const results: { id: string; lat: number; lng: number; address: string | null }[] = [];
  const unresolved: { id: string; reason: string }[] = [];
  let googleError: string | null = null;
  // One lookup per distinct address text within the batch (several jobs for
  // the same client share one call).
  const lookupCache = new Map<string, { lat: number; lng: number } | null>();

  async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    if (lookupCache.has(address)) return lookupCache.get(address) ?? null;
    if (googleError) return null; // key/quota failure — don't keep hammering
    let location: { lat: number; lng: number } | null = null;
    try {
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(apiKey!)}`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json() as GeocodeResponse;
      if (geoData.status === "OK") {
        location = geoData.results[0]?.geometry?.location ?? null;
      } else if (GOOGLE_FAILURE_STATUSES.has(geoData.status)) {
        googleError = geoData.error_message
          ? `${geoData.status}: ${geoData.error_message}`
          : geoData.status;
      }
      // ZERO_RESULTS → this address is simply unknown to Google; not a failure.
    } catch (err) {
      googleError = err instanceof Error ? `Network error reaching Google Maps: ${err.message}` : "Network error reaching Google Maps";
    }
    lookupCache.set(address, location);
    return location;
  }

  async function cacheCoords(resolved: ResolvedAddress, jobId: string, loc: { lat: number; lng: number }) {
    // The job row is what the next call reads first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb as any).from("crm_jobs").update({ lat: loc.lat, lng: loc.lng }).eq("id", jobId);
    // Best-effort: also cache on the row the address came from so sibling
    // jobs for the same client/property skip the lookup. Tolerates the
    // lat/lng columns not existing yet (pre-migration).
    try {
      if (resolved.source === "property") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("client_properties").update({ lat: loc.lat, lng: loc.lng }).eq("id", resolved.sourceId);
      } else if (resolved.source === "client_service" || resolved.source === "client_billing") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any).from("clients").update({ lat: loc.lat, lng: loc.lng }).eq("id", resolved.sourceId);
      }
    } catch {
      // ignore — caching on the source row is an optimization only
    }
  }

  for (const job of jobs) {
    if (job.lat != null && job.lng != null) {
      results.push({ id: job.id, lat: job.lat, lng: job.lng, address: null });
      continue;
    }
    const resolved = resolveAddress(job);
    if (!resolved) {
      unresolved.push({ id: job.id, reason: "no_address" });
      continue;
    }
    if (resolved.cached) {
      results.push({ id: job.id, lat: resolved.cached.lat, lng: resolved.cached.lng, address: resolved.text });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (sb as any).from("crm_jobs").update({ lat: resolved.cached.lat, lng: resolved.cached.lng }).eq("id", job.id);
      continue;
    }
    const loc = await geocode(resolved.text);
    if (!loc) {
      unresolved.push({ id: job.id, reason: googleError ? "google_error" : "not_found" });
      continue;
    }
    await cacheCoords(resolved, job.id, loc);
    results.push({ id: job.id, lat: loc.lat, lng: loc.lng, address: resolved.text });
  }

  for (const id of jobIds) {
    if (!jobs.some((j) => j.id === id)) unresolved.push({ id, reason: "not_found_in_org" });
  }

  // Nothing at all resolved AND Google refused → a real error, not an empty result.
  if (results.length === 0 && googleError) {
    return NextResponse.json({ error: `Google Maps geocoding failed: ${googleError}`, googleError, results, unresolved }, { status: 502 });
  }

  return NextResponse.json({ results, unresolved, googleError });
}
