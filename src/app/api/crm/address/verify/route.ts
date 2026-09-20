import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Database } from "@/types/supabase";
import { logger } from "@/lib/logger";
import { GOOGLE_FAILURE_STATUSES, resolveGoogleMapsKey } from "@/lib/google-maps-key";
import type { AddressParts, AddressVerdict, VerifyAddressResult } from "@/types/address-verification";

/**
 * POST /api/crm/address/verify - checks one hand-entered address and returns
 * Google's normalized version of it, a verdict, and coordinates.
 *
 * Server-side on purpose: the org's (or our platform's) Maps key never reaches
 * the browser. Shares resolveGoogleMapsKey() with /api/crm/route-optimize and
 * /api/crm/jobs/geocode so all three agree on which key an org uses.
 *
 * Two providers, in order:
 *  1. Address Validation API - the only one that catches a street existing
 *     under two suffixes ("100 Northgate Pkwy" vs "100 Northgate Dr"), because
 *     it reports per-component confirmation rather than just "found something".
 *  2. Geocoding API - the fallback when Address Validation isn't enabled on the
 *     org's key. It is a separate API in Google Cloud, and Settings ->
 *     Integrations has only ever told orgs to enable Distance Matrix /
 *     Geocoding / Maps JS, so most existing keys will not have it. Weaker:
 *     partial_match is the most it can say, and the result is labelled as such
 *     so the UI can be honest about the weaker check.
 *
 * Advisory by design - the caller shows a suggestion and never blocks a save.
 * A Google-side failure comes back as an error, never folded into "this address
 * is bad", so a dead key or a blown quota does not read to the user as a typo.
 */

const BodySchema = z.object({
  address: z.string().trim().min(1),
  city: z.string().trim().optional().default(""),
  state: z.string().trim().optional().default(""),
  zip: z.string().trim().optional().default(""),
});

interface ValidationComponent {
  componentType?: string;
  confirmationLevel?: string;
}

interface ValidationResponse {
  result?: {
    verdict?: {
      addressComplete?: boolean;
      /** PREMISE / SUB_PREMISE / PREMISE_PROXIMITY / ROUTE / OTHER. */
      validationGranularity?: string;
      /** ACCEPT / CONFIRM / CONFIRM_ADD_SUBPREMISES / FIX. */
      possibleNextAction?: string;
      hasUnconfirmedComponents?: boolean;
      hasInferredComponents?: boolean;
    };
    address?: {
      postalAddress?: {
        addressLines?: string[];
        locality?: string;
        administrativeArea?: string;
        postalCode?: string;
      };
      addressComponents?: ValidationComponent[];
    };
    geocode?: { location?: { latitude?: number; longitude?: number } };
  };
  error?: { message?: string; status?: string };
}

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results: {
    partial_match?: boolean;
    geometry: { location: { lat: number; lng: number }; location_type?: string };
    address_components: { long_name: string; short_name: string; types: string[] }[];
  }[];
}

function joinTyped(p: AddressParts): string {
  return [p.address, p.city, p.state, p.zip].map((s) => s?.trim()).filter(Boolean).join(", ");
}

/**
 * Address Validation. Returns null (rather than an error) when the API itself
 * is unavailable to this key, so the caller can fall through to Geocoding -
 * a 403 here usually means "this org never enabled the API", which is a
 * configuration fact about the org, not a fact about the address.
 */
async function tryAddressValidation(
  typed: AddressParts,
  apiKey: string
): Promise<VerifyAddressResult | null> {
  const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(apiKey)}`;
  let data: ValidationResponse;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: {
          regionCode: "US",
          addressLines: [typed.address],
          locality: typed.city || undefined,
          administrativeArea: typed.state || undefined,
          postalCode: typed.zip || undefined,
        },
      }),
    });
    if (!res.ok) {
      logger.info("[address/verify] address validation unavailable, falling back to geocoding", {
        status: res.status,
      });
      return null;
    }
    data = (await res.json()) as ValidationResponse;
  } catch {
    return null;
  }

  const result = data.result;
  if (!result?.address?.postalAddress) return null;

  const v = result.verdict ?? {};
  const levelOf = (type: string) =>
    (result.address?.addressComponents ?? []).find((c) => c.componentType === type)?.confirmationLevel;

  // `hasUnconfirmedComponents` is NOT the signal it reads like: measured against
  // the live API it is true for 455 Main St Worcester and for Google's own
  // 1600 Amphitheatre Parkway, because an unconfirmed street NUMBER is routine.
  // Using it would have flagged every address in the system.
  //
  // What actually separates a real street from an invented one is whether the
  // `route` component is CONFIRMED - which collapses to the same fact the
  // Geocoding fallback reads off a missing `route` component. Google's own
  // summary fields agree, so all three are checked and any one is enough:
  //
  //   100 Northgate Pkwy  -> OTHER  / FIX    / route UNCONFIRMED  (bad street)
  //   99999 Fakestreet    -> OTHER  / FIX    / route UNCONFIRMED  (invented)
  //   14 Birchwood Ln     -> PREMISE_PROXIMITY / ACCEPT / route CONFIRMED
  //   1600 Amphitheatre   -> PREMISE / ACCEPT / route CONFIRMED
  const routeLevel = levelOf("route");
  const suspicious =
    v.addressComplete === false ||
    v.validationGranularity === "OTHER" ||
    v.possibleNextAction === "FIX" ||
    (routeLevel !== undefined && routeLevel !== "CONFIRMED");

  const pa = result.address.postalAddress;
  const normalized = {
    address: (pa.addressLines ?? []).join(" ").trim() || typed.address,
    city: pa.locality ?? typed.city,
    state: pa.administrativeArea ?? typed.state,
    // Google returns ZIP+4 ("01608-1821"). Every zip in this app is 5-digit, and
    // surfacing the +4 as a difference would put a pointless "did you mean" under
    // an address that is already correct. Keep the 5-digit prefix.
    zip: (pa.postalCode ?? typed.zip).split("-")[0],
  };

  if (suspicious) {
    // Google echoes an unrecognized street back unchanged, so offering its
    // "normalized" version as a correction would just repeat the typo back.
    return {
      verdict: "unconfirmed_and_suspicious",
      normalized: typed,
      lat: null,
      lng: null,
      source: "validation",
    };
  }

  // CONFIRM_ADD_SUBPREMISES means a multi-unit building wants an apartment
  // number. For a service address that is still the right place to drive to.
  //
  // `hasInferredComponents` is deliberately not consulted: Google infers the
  // ZIP+4 on essentially every US address, so requiring its absence left
  // nothing reaching "confirmed" at all - 455 Main St Worcester and 1600
  // Amphitheatre Parkway both failed it. A confirmed street and a confirmed
  // street number is the bar.
  const verdict: AddressVerdict =
    levelOf("street_number") === "CONFIRMED" ? "confirmed" : "unconfirmed_but_plausible";

  return {
    verdict,
    normalized,
    lat: result.geocode?.location?.latitude ?? null,
    lng: result.geocode?.location?.longitude ?? null,
    source: "validation",
  };
}

function componentOf(
  components: GeocodeResponse["results"][number]["address_components"],
  type: string,
  short = false
): string {
  const hit = components.find((c) => c.types.includes(type));
  return (short ? hit?.short_name : hit?.long_name) ?? "";
}

/** Geocoding fallback. Returns null only when Google itself failed. */
async function tryGeocoding(
  typed: AddressParts,
  apiKey: string
): Promise<VerifyAddressResult | null> {
  const url =
    "https://maps.googleapis.com/maps/api/geocode/json" +
    `?address=${encodeURIComponent(joinTyped(typed))}&key=${encodeURIComponent(apiKey)}`;
  let data: GeocodeResponse;
  try {
    const res = await fetch(url);
    data = (await res.json()) as GeocodeResponse;
  } catch {
    return null;
  }

  if (GOOGLE_FAILURE_STATUSES.has(data.status)) {
    logger.error("[address/verify] geocoding failed", {
      status: data.status,
      message: data.error_message ?? null,
    });
    return null;
  }
  // ZERO_RESULTS is an answer about the address, not a failure.
  if (data.status === "ZERO_RESULTS" || !data.results[0]) {
    return {
      verdict: "not_found",
      normalized: typed,
      lat: null,
      lng: null,
      source: "geocode",
    };
  }

  const top = data.results[0];
  const c = top.address_components;
  const route = componentOf(c, "route");

  // No `route` component means Google could not find the street at all and
  // answered with the town centroid (location_type APPROXIMATE) - which is
  // what both "100 Northgate Pkwy" and "100 Northgate Dr" do, and what a
  // completely invented street does too. That is the single most useful signal
  // this weaker API gives us, and it is the one that would have caught the
  // Northgate pair. Keep the typed address rather than offering a town centroid
  // as a "correction", which would be worse than what the user wrote.
  if (!route) {
    return {
      verdict: "unconfirmed_and_suspicious",
      normalized: typed,
      lat: null,
      lng: null,
      source: "geocode",
    };
  }

  const streetNumber = componentOf(c, "street_number");
  return {
    // Geocoding cannot confirm components the way Address Validation does, so
    // the best it earns is "plausible" - never "confirmed".
    verdict: top.partial_match ? "partial_match" : "unconfirmed_but_plausible",
    normalized: {
      address: [streetNumber, route].filter(Boolean).join(" ") || typed.address,
      city: componentOf(c, "locality") || componentOf(c, "sublocality") || typed.city,
      state: componentOf(c, "administrative_area_level_1", true) || typed.state,
      zip: componentOf(c, "postal_code") || typed.zip,
    },
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    source: "geocode",
  };
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A street address is required" }, { status: 400 });
  }
  const typed: AddressParts = parsed.data;

  const sb = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const keyResult = await resolveGoogleMapsKey(sb, profile.org_id);
  if ("error" in keyResult) {
    return NextResponse.json({ error: keyResult.error }, { status: keyResult.status });
  }

  const viaValidation = await tryAddressValidation(typed, keyResult.apiKey);
  if (viaValidation) return NextResponse.json(viaValidation);

  const viaGeocode = await tryGeocoding(typed, keyResult.apiKey);
  if (viaGeocode) return NextResponse.json(viaGeocode);

  // Both providers failed on Google's side. Say that, rather than implying the
  // address is wrong.
  return NextResponse.json(
    { error: "Could not reach Google to check this address - it was left as typed." },
    { status: 502 }
  );
}
