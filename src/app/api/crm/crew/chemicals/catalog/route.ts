import { NextResponse } from "next/server";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";

/**
 * GET ?visitId=… — what the crew needs to add a chemical at a stop: the org's chemical
 * products (with each one's usual unit), the units to pick from, and which conditions
 * (weather / pH) the company wants recorded. Read with the service role after proving
 * the caller works the visit, since crew sessions can't read these catalog tables.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visitId = new URL(request.url).searchParams.get("visitId");
  if (!visitId) return NextResponse.json({ error: "visitId required" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, crew_id, crew_unassigned, crm_jobs(crew_id)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const db = adminClient();
  const lookup = (listType: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from("crm_chemical_lookup_items")
      .select("id, name")
      .eq("org_id", visit.org_id)
      .eq("list_type", listType)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order");
  const [products, units, settings, rates, methods, targets, areas] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from("product_items")
      .select("id, name")
      .eq("org_id", visit.org_id)
      .eq("track_chemicals", true)
      .is("deleted_at", null)
      .order("name"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any)
      .from("crm_chemical_lookup_items")
      .select("id, name")
      .eq("org_id", visit.org_id)
      .eq("list_type", "volume_unit")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from("crm_chemical_settings").select("conditions_display, default_unit_of_measure_id").eq("org_id", visit.org_id).maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db as any).from("crm_chemical_application_rates").select("product_id, unit_of_measure_id").eq("org_id", visit.org_id).eq("is_default", true),
    lookup("application_method"),
    lookup("target"),
    lookup("areas_treated"),
  ]);
  if (products.error) return NextResponse.json({ error: products.error.message }, { status: 500 });

  const unitByProduct = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((rates.data ?? []) as any[]).filter((r) => r.unit_of_measure_id).map((r) => [r.product_id, r.unit_of_measure_id])
  );
  return NextResponse.json({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    products: ((products.data ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      defaultUnitId: unitByProduct.get(p.id) ?? settings.data?.default_unit_of_measure_id ?? null,
    })),
    units: units.data ?? [],
    methods: methods.data ?? [],
    targets: targets.data ?? [],
    areasTreated: areas.data ?? [],
    conditionsDisplay: settings.data?.conditions_display ?? "weather",
  });
}
