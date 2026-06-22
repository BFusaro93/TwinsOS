import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

interface DistanceMatrixRow {
  elements: { status: string; duration: { value: number } }[];
}

interface DistanceMatrixResponse {
  status: string;
  rows: DistanceMatrixRow[];
}

/**
 * Nearest-neighbor TSP heuristic.
 * Returns an ordered list of indices into `matrix`.
 */
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

export async function POST(request: Request) {
  // ── auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { visitIds: string[] };
  const { visitIds } = body;
  if (!visitIds || visitIds.length < 2) {
    return NextResponse.json({ error: "Need at least 2 visits to optimize" }, { status: 400 });
  }

  // ── fetch org to get the API key ───────────────────────────────────────────
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

  // ── fetch visits + job addresses ──────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (sb as any)
    .from("crm_job_visits")
    .select("id, job_id, crm_jobs(service_address, service_city, service_state, service_zip)")
    .in("id", visitIds)
    .is("deleted_at", null);

  if (!visits || visits.length < 2) {
    return NextResponse.json({ error: "Could not load visits" }, { status: 404 });
  }

  // Build address strings; filter out visits with no address
  type VisitWithAddr = { id: string; address: string };
  const withAddresses: VisitWithAddr[] = [];

  for (const v of visits) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = (v as any).crm_jobs;
    if (!job?.service_address) continue;
    const addr = [
      job.service_address,
      job.service_city,
      job.service_state,
      job.service_zip,
    ].filter(Boolean).join(", ");
    withAddresses.push({ id: v.id, address: addr });
  }

  if (withAddresses.length < 2) {
    return NextResponse.json(
      { error: "Not enough visits have service addresses for route optimization." },
      { status: 422 }
    );
  }

  // ── call Distance Matrix API ───────────────────────────────────────────────
  const addrs = withAddresses.map((v) => encodeURIComponent(v.address)).join("|");
  const dmUrl =
    `https://maps.googleapis.com/maps/api/distancematrix/json` +
    `?origins=${addrs}&destinations=${addrs}&mode=driving&key=${apiKey}`;

  let dmData: DistanceMatrixResponse;
  try {
    const dmRes = await fetch(dmUrl);
    dmData = await dmRes.json() as DistanceMatrixResponse;
  } catch {
    return NextResponse.json({ error: "Failed to reach Google Maps API" }, { status: 502 });
  }

  if (dmData.status !== "OK") {
    return NextResponse.json(
      { error: `Google Maps API error: ${dmData.status}` },
      { status: 422 }
    );
  }

  // Build cost matrix (seconds → we'll convert to minutes in the response)
  const n = withAddresses.length;
  const matrix: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => {
      const el = dmData.rows[i]?.elements[j];
      return el?.status === "OK" ? el.duration.value : 999999;
    })
  );

  // ── nearest-neighbor sort ─────────────────────────────────────────────────
  const order = nearestNeighbor(matrix);

  // Build results
  const orderedVisitIds = order.map((idx) => withAddresses[idx].id);

  // Drive time from stop i → stop i+1 (minutes, rounded)
  const driveTimes: { visitId: string; minutesToNext: number }[] = [];
  for (let i = 0; i < order.length - 1; i++) {
    const from = order[i];
    const to   = order[i + 1];
    driveTimes.push({
      visitId: withAddresses[from].id,
      minutesToNext: Math.round(matrix[from][to] / 60),
    });
  }

  // Visits that had no address — append them at the end in original order
  const optimizedIds = new Set(orderedVisitIds);
  const remainderIds = visitIds.filter((id) => !optimizedIds.has(id));

  return NextResponse.json({
    orderedVisitIds: [...orderedVisitIds, ...remainderIds],
    driveTimes,
    totalDriveMinutes: driveTimes.reduce((s, d) => s + d.minutesToNext, 0),
  });
}
