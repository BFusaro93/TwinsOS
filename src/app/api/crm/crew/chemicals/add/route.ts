import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit, effectiveVisitCrewId } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";
import { loadProductRateInfo } from "@/lib/chemical/rate-info";

/**
 * The crew adds a chemical the office didn't preload (an extra spot treatment, a
 * substitute product) and records how much was used. It is saved already confirmed,
 * as an application that was actually made — never as a planned estimate.
 *
 * Crew sessions can't write crm_chemical_applications themselves, so this writes with
 * the service role AFTER proving the caller works the visit's stop.
 */
const Body = z.object({
  visitId: z.string().uuid(),
  productId: z.string().uuid(),
  chemicalAmount: z.number().positive().max(1_000_000),
  unitOfMeasureId: z.string().uuid(),
  /** How it was applied; the product's default method is used when this is left out. */
  applicationMethodId: z.string().uuid().nullable().optional(),
  targetIds: z.array(z.string().uuid()).max(30).optional(),
  areasTreatedIds: z.array(z.string().uuid()).max(30).optional(),
  /** Conditions at the stop, same shape the confirm route takes. A crew-added row is saved
   *  already confirmed, so this is the only chance to record them on it. */
  conditions: z
    .object({
      temperature: z.number().min(-60).max(150).optional(),
      windSpeed: z.number().min(0).max(200).optional(),
      windDirection: z.string().trim().max(8).optional(),
      phLevel: z.number().min(0).max(14).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { visitId, productId, chemicalAmount, unitOfMeasureId, applicationMethodId, targetIds, areasTreatedIds, conditions } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, job_id, status, crew_id, crew_unassigned, clocked_in_at, crm_jobs(crew_id)")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  if (["completed", "cancelled", "skipped"].includes(visit.status ?? "")) {
    return NextResponse.json({ error: "This visit is already closed out." }, { status: 409 });
  }
  // A compliance record needs a real application window, same rule as confirming.
  if (!visit.clocked_in_at) {
    return NextResponse.json({ error: "Start the job before adding a chemical." }, { status: 409 });
  }

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: product } = await (db as any)
    .from("product_items")
    .select("id, org_id, epa_registration_number, re_entry_interval, restricted_product, track_chemicals")
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!product || product.org_id !== visit.org_id || !product.track_chemicals) {
    return NextResponse.json({ error: "That isn't a chemical product." }, { status: 400 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: unit } = await (db as any)
    .from("crm_chemical_lookup_items")
    .select("id")
    .eq("id", unitOfMeasureId)
    .eq("org_id", visit.org_id)
    // An amount unit, never a target / method / area row's id.
    .eq("list_type", "volume_unit")
    .is("deleted_at", null)
    .maybeSingle();
  if (!unit) return NextResponse.json({ error: "Unknown unit." }, { status: 400 });

  // Method/target/area ids come from the client and the insert uses the service role, so each
  // must be a live lookup item of the visit's company (same check as confirming).
  const lookupIds = [...new Set([applicationMethodId ?? null, ...(targetIds ?? []), ...(areasTreatedIds ?? [])].filter((v): v is string => !!v))];
  if (lookupIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: found } = await (db as any)
      .from("crm_chemical_lookup_items")
      .select("id")
      .in("id", lookupIds)
      .eq("org_id", visit.org_id)
      .is("deleted_at", null);
    if ((found ?? []).length !== lookupIds.length) {
      return NextResponse.json({ error: "Unknown method, target or area" }, { status: 400 });
    }
  }

  // Applicator of record: the crew's foreman (crew logins are shared), license as of now.
  let applicatorEmployeeId: string | null = null;
  let applicatorLicense: string | null = null;
  const crewId = effectiveVisitCrewId(visit);
  if (crewId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foreman } = await (db as any)
      .from("crm_crew_members")
      .select("employee_id")
      .eq("crew_id", crewId)
      .eq("is_foreman", true)
      .is("deleted_at", null)
      .not("employee_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (foreman?.employee_id) {
      applicatorEmployeeId = foreman.employee_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: emp } = await (db as any)
        .from("crm_employees")
        .select("applicator_license")
        .eq("id", foreman.employee_id)
        .maybeSingle();
      applicatorLicense = emp?.applicator_license ?? null;
    }
  }

  // The product's default rate: its method (when the crew didn't pick one) and the rate label
  // the compliance record keeps. Tolerates a product with several rates marked default.
  const rate = (await loadProductRateInfo(db, visit.org_id, [productId])).get(productId);

  const nowIso = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error } = await (db as any)
    .from("crm_chemical_applications")
    .insert({
      org_id: visit.org_id,
      job_id: visit.job_id,
      visit_id: visitId,
      product_id: productId,
      used: true,
      chemical_amount: chemicalAmount,
      unit_of_measure_id: unitOfMeasureId,
      application_method_id: applicationMethodId !== undefined ? applicationMethodId : rate?.applicationMethodId ?? null,
      application_rate_label: rate?.rateLabel ?? null,
      ...(targetIds !== undefined ? { target_ids: targetIds } : {}),
      ...(areasTreatedIds !== undefined ? { areas_treated_ids: areasTreatedIds } : {}),
      ...(conditions?.temperature !== undefined ? { temperature: conditions.temperature } : {}),
      ...(conditions?.windSpeed !== undefined ? { wind_speed: conditions.windSpeed } : {}),
      ...(conditions?.windDirection ? { wind_direction: conditions.windDirection } : {}),
      ...(conditions?.phLevel !== undefined ? { ph_level: conditions.phLevel } : {}),
      epa_number_snapshot: product.epa_registration_number ?? null,
      re_entry_interval_snapshot: product.re_entry_interval ?? null,
      restricted_product_snapshot: product.restricted_product ?? false,
      applicator_employee_id: applicatorEmployeeId,
      applicator_license_number: applicatorLicense,
      application_start_time: visit.clocked_in_at,
      application_end_time: nowIso,
      preloaded: false,
      confirmed_at: nowIso,
      confirmed_by: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: inserted.id });
}
