import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Database } from "@/types/supabase";
import { logger } from "@/lib/logger";

interface DistanceMatrixRow {
  elements: { status: string; duration?: { value: number } }[];
}

interface DistanceMatrixResponse {
  status: string;
  error_message?: string;
  rows: DistanceMatrixRow[];
}

const UNREACHABLE = 999999;

/**
 * Google's Distance Matrix API caps a request at 100 elements
 * (origins × destinations), 25 of each. The previous implementation sent the
 * whole n×n grid in one call, so any route with more than 10 stops came back
 * MAX_ELEMENTS_EXCEEDED and the whole optimize failed — which is most real
 * dispatch days. Walk the grid in blocks instead.
 */
const BLOCK = 10;

const BodySchema = z.object({
  visitIds: z.array(z.string().uuid()).min(2).max(60),
  /**
   * nearest_first — leave the shop and take the closest stop each time.
   * furthest_first — drive out to the far end first and work back in, so the
   * crew finishes near the shop. Same greedy tour, reversed: a path
   * shop→A→B→C read backwards is C→B→A→shop.
   */
  strategy: z.enum(["nearest_first", "furthest_first"]).default("nearest_first"),
  /** Crew whose starting address anchors the tour. */
  crewId: z.string().uuid().nullable().optional(),
});

/** Greedy nearest-neighbour from index 0. */
function nearestNeighbor(matrix: number[][]): number[] {
  const n = matrix.length;
  const visited = new Array(n).fill(false);
  const order: number[] = [0];
  visited[0] = true;

  for (let step = 1; step < n; step++) {
    const current = order[order.length - 1];
    let bestIdx = -1;
    let bestTime = Infinity;
    for (let j = 0; j < n; j++) {
      if (!visited[j] && matrix[current][j] < bestTime) {
        bestTime = matrix[current][j];
        bestIdx = j;
      }
    }
    if (bestIdx === -1) break;
    visited[bestIdx] = true;
    order.push(bestIdx);
  }
  return order;
}

async function fetchMatrix(
  addresses: string[],
  apiKey: string
): Promise<{ matrix: number[][] } | { error: string; status: number }> {
  const n = addresses.length;
  const matrix: number[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => UNREACHABLE)
  );
  for (let i = 0; i < n; i++) matrix[i][i] = 0;

  for (let oStart = 0; oStart < n; oStart += BLOCK) {
    const origins = addresses.slice(oStart, oStart + BLOCK);
    for (let dStart = 0; dStart < n; dStart += BLOCK) {
      const destinations = addresses.slice(dStart, dStart + BLOCK);
      const url =
        `https://maps.googleapis.com/maps/api/distancematrix/json` +
        `?origins=${origins.map(encodeURIComponent).join("|")}` +
        `&destinations=${destinations.map(encodeURIComponent).join("|")}` +
        `&mode=driving&key=${apiKey}`;

      let data: DistanceMatrixResponse;
      try {
        const res = await fetch(url);
        data = (await res.json()) as DistanceMatrixResponse;
      } catch {
        return { error: "Failed to reach Google Maps API", status: 502 };
      }
      if (data.status !== "OK") {
        // Don't leak the key or the full URL into the client-facing message.
        logger.error("[route-optimize] distance matrix error", {
          status: data.status,
          message: data.error_message ?? null,
        });
        return { error: `Google Maps API error: ${data.status}`, status: 422 };
      }

      for (let i = 0; i < origins.length; i++) {
        for (let j = 0; j < destinations.length; j++) {
          const el = data.rows[i]?.elements[j];
          matrix[oStart + i][dStart + j] =
            el?.status === "OK" && el.duration ? el.duration.value : UNREACHABLE;
        }
      }
    }
  }
  return { matrix };
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

  const parsed = BodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Need at least 2 visits to optimize" },
      { status: 400 }
    );
  }
  const { visitIds, strategy, crewId } = parsed.data;

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

  // This query runs on the service-role client (needed above to read the org's
  // Google Maps key), which bypasses RLS entirely — so unlike the normal
  // cookie-scoped client, we must filter by org_id ourselves here or a caller
  // could pass visitIds belonging to another tenant and get their addresses
  // back. org_id always comes from the authenticated session, never the request.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (sb as any)
    .from("crm_job_visits")
    .select("id, job_id, crm_jobs(service_address, service_city, service_state, service_zip)")
    .in("id", visitIds)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null);

  if (!visits || visits.length < 2) {
    return NextResponse.json({ error: "Could not load visits" }, { status: 404 });
  }

  type VisitWithAddr = { id: string; address: string };
  const withAddresses: VisitWithAddr[] = [];
  for (const v of visits) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = (v as any).crm_jobs;
    if (!job?.service_address) continue;
    const addr = [job.service_address, job.service_city, job.service_state, job.service_zip]
      .filter(Boolean)
      .join(", ");
    withAddresses.push({ id: v.id, address: addr });
  }

  if (withAddresses.length < 2) {
    return NextResponse.json(
      { error: "Not enough visits have service addresses for route optimization." },
      { status: 422 }
    );
  }

  // The crew's shop/yard anchors the tour. Without it the greedy walk started
  // at whichever visit happened to be first in the array, so the "optimized"
  // route didn't begin where the crew actually begins — and the result changed
  // depending on how the board happened to be sorted.
  let originAddress: string | null = null;
  if (crewId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: crew } = await (sb as any)
      .from("crm_crews")
      .select("starting_address, starting_city, starting_state, starting_zip")
      .eq("id", crewId)
      .eq("org_id", profile.org_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (crew?.starting_address) {
      originAddress = [
        crew.starting_address,
        crew.starting_city,
        crew.starting_state,
        crew.starting_zip,
      ]
        .filter(Boolean)
        .join(", ");
    }
  }

  // With an origin it sits at index 0 and is dropped from the result; without
  // one we fall back to the old behaviour of anchoring on the first visit.
  const nodes = originAddress
    ? [originAddress, ...withAddresses.map((v) => v.address)]
    : withAddresses.map((v) => v.address);

  const result = await fetchMatrix(nodes, apiKey);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const { matrix } = result;

  const tour = nearestNeighbor(matrix);

  // Reversing the greedy tour turns "leave the shop, take the nearest stop
  // each time" into "start at the far end and work back toward the shop".
  const oriented = strategy === "furthest_first" ? [...tour].reverse() : tour;

  // Map node indices back to visits, dropping the origin node.
  const visitIndexOf = (node: number) => (originAddress ? node - 1 : node);
  const orderedVisitIds = oriented
    .filter((node) => !(originAddress && node === 0))
    .map((node) => withAddresses[visitIndexOf(node)].id);

  // Drive time from each stop to the next, in the direction actually driven.
  const driveTimes: { visitId: string; minutesToNext: number }[] = [];
  const drivenSequence = oriented.filter((node) => !(originAddress && node === 0));
  for (let i = 0; i < drivenSequence.length - 1; i++) {
    driveTimes.push({
      visitId: withAddresses[visitIndexOf(drivenSequence[i])].id,
      minutesToNext: Math.round(matrix[drivenSequence[i]][drivenSequence[i + 1]] / 60),
    });
  }

  // The shop leg: out to the first stop when working nearest-first, home from
  // the last stop when working furthest-first. Reported separately so the
  // board can show it without it being mistaken for a stop-to-stop leg.
  let shopLegMinutes: number | null = null;
  if (originAddress && drivenSequence.length > 0) {
    const shopLeg =
      strategy === "furthest_first"
        ? matrix[drivenSequence[drivenSequence.length - 1]][0]
        : matrix[0][drivenSequence[0]];
    if (shopLeg < UNREACHABLE) shopLegMinutes = Math.round(shopLeg / 60);
  }

  // Visits that had no address — append them at the end in original order.
  const optimizedIds = new Set(orderedVisitIds);
  const remainderIds = visitIds.filter((id) => !optimizedIds.has(id));

  return NextResponse.json({
    orderedVisitIds: [...orderedVisitIds, ...remainderIds],
    driveTimes,
    totalDriveMinutes: driveTimes.reduce((s, d) => s + d.minutesToNext, 0),
    shopLegMinutes,
    anchoredToShop: !!originAddress,
    strategy,
  });
}
