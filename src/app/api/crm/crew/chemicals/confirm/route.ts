import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit, effectiveVisitCrewId } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";
import { loadProductRateInfo } from "@/lib/chemical/rate-info";

/**
 * Crew confirmation of the chemicals applied at a stop.
 *
 * Dispatch preloads each service's chemicals at the PLANNED amount. That is only
 * an estimate until the crew says what was actually used: this route records the
 * amount (or "Not used") on each preloaded row and stamps who confirmed it. The
 * compliance report and the stock deduction count only confirmed rows, and (in
 * `crew_required` mode) a visit can't be completed while one is unconfirmed.
 *
 * Crew sessions can't write crm_chemical_applications themselves, so this writes
 * with the service role AFTER proving the caller works each visit's stop.
 */

const Item = z.object({
  id: z.string().uuid(),
  used: z.boolean(),
  /** Concentrate amount actually used, in the row's existing unit. Required when used. */
  chemicalAmount: z.number().positive().max(1_000_000).optional(),
  /** Unit of that amount. Required when the planned row has no unit yet (nothing was
   *  estimated); a row that already has one keeps it. */
  unitOfMeasureId: z.string().uuid().optional(),
  /** How it was actually applied, when the crew changed it from what the office planned. */
  applicationMethodId: z.string().uuid().nullable().optional(),
  targetIds: z.array(z.string().uuid()).max(30).optional(),
  areasTreatedIds: z.array(z.string().uuid()).max(30).optional(),
});
/** Conditions at the stop (the company's Conditions setting decides which the crew is asked for). */
const Conditions = z.object({
  temperature: z.number().min(-60).max(150).optional(),
  windSpeed: z.number().min(0).max(200).optional(),
  windDirection: z.string().trim().max(8).optional(),
  phLevel: z.number().min(0).max(14).optional(),
});
const Body = z.object({ items: z.array(Item).min(1).max(50), conditions: Conditions.optional() });

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { items, conditions } = parsed.data;

  for (const it of items) {
    if (it.used && it.chemicalAmount === undefined) {
      return NextResponse.json({ error: "Enter the amount used, or mark it Not used" }, { status: 400 });
    }
  }

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: rowsError } = await (db as any)
    .from("crm_chemical_applications")
    .select("id, org_id, visit_id, product_id, unit_of_measure_id, application_rate_label, application_start_time, application_end_time, chemical_amount, solution_amount, applicator_employee_id, applicator_license_number, confirmed_at")
    .in("id", items.map((i) => i.id))
    .is("deleted_at", null);
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
  if ((rows ?? []).length !== items.length) {
    return NextResponse.json({ error: "Chemical entry not found" }, { status: 404 });
  }
  // A confirmed row is the compliance record of what was applied. The crew records it once;
  // after that only the office can correct it (Application panel, which the audit trail logs).
  // Rewriting it here re-stamped the record and re-ran the inventory sync after the Notice of
  // Treatment had already gone out. Rows already confirmed (a second phone, a retried tap) are
  // skipped rather than failing the whole set, so the rest still get recorded.
  const alreadyConfirmed = (rows as { confirmed_at: string | null }[]).filter((r) => r.confirmed_at).length;

  // An amount with no unit is not a record of anything: a row planned without an estimate
  // has no unit, so the crew has to say which one they measured in.
  const rowById = new Map((rows as { id: string; unit_of_measure_id: string | null; confirmed_at: string | null }[]).map((r) => [r.id, r]));
  if (items.some((i) => i.used && !rowById.get(i.id)?.confirmed_at && !rowById.get(i.id)?.unit_of_measure_id && !i.unitOfMeasureId)) {
    return NextResponse.json({ error: "Choose the unit for each amount used" }, { status: 400 });
  }

  const orgIds = [...new Set((rows as { org_id: string }[]).map((r) => r.org_id))];
  // A unit must be a volume/weight unit of the same company (the write uses the service role).
  const unitIds = [...new Set(items.map((i) => i.unitOfMeasureId).filter((v): v is string => !!v))];
  if (unitIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: foundUnits } = await (db as any)
      .from("crm_chemical_lookup_items")
      .select("id")
      .in("id", unitIds)
      .in("org_id", orgIds)
      .eq("list_type", "volume_unit")
      .is("deleted_at", null);
    if ((foundUnits ?? []).length !== unitIds.length) {
      return NextResponse.json({ error: "Unknown unit" }, { status: 400 });
    }
  }

  // Method/target/area ids come from the client and the write below uses the service role, so
  // make sure every one is a lookup item of the same company as the rows being confirmed.
  const lookupIds = [...new Set(items.flatMap((i) => [i.applicationMethodId ?? null, ...(i.targetIds ?? []), ...(i.areasTreatedIds ?? [])]).filter((v): v is string => !!v))];
  if (lookupIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: found } = await (db as any)
      .from("crm_chemical_lookup_items")
      .select("id")
      .in("id", lookupIds)
      .in("org_id", orgIds)
      .is("deleted_at", null);
    if ((found ?? []).length !== lookupIds.length) {
      return NextResponse.json({ error: "Unknown method, target or area" }, { status: 400 });
    }
  }

  // A row with no visit can't be tied to the caller's stop, and `rows` was read with the
  // service role across all orgs — without this check anyone signed in could confirm it.
  if ((rows as { visit_id: string | null }[]).some((r) => !r.visit_id)) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  const visitIds = [...new Set((rows as { visit_id: string | null }[]).map((r) => r.visit_id).filter((v): v is string => !!v))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, status, crew_id, crew_unassigned, clocked_in_at, crm_jobs:crew_job(crew_id)")
    .in("id", visitIds)
    .is("deleted_at", null);
  const visitById = new Map<string, { id: string; org_id: string; status: string | null; clocked_in_at: string | null }>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((visits ?? []) as any[]).map((v) => [v.id, v])
  );

  // Every row's visit must be one this caller is assigned to (org-scoped by RLS above).
  for (const visitId of visitIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visit = (visits ?? []).find((v: any) => v.id === visitId);
    if (!visit || !(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit))) {
      return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
    }
  }

  // A closed-out visit's records are final for the crew, same rule as adding a chemical.
  if (visitIds.some((id) => ["completed", "cancelled", "skipped"].includes(visitById.get(id)?.status ?? ""))) {
    return NextResponse.json(
      { error: "This visit is already closed out. Ask the office to correct the chemical record." },
      { status: 409 }
    );
  }

  // A compliance record needs a real application window: confirming before the stop is
  // started wrote no start time and an end time before the work began.
  if (visitIds.some((id) => !visitById.get(id)?.clocked_in_at)) {
    return NextResponse.json({ error: "Start the job before confirming chemicals." }, { status: 409 });
  }

  // The applicator of record is the crew's foreman (crew logins are shared per crew), with the
  // license number snapshotted as of the application. The compliance report showed blank
  // applicator/license for every crew-confirmed row.
  const applicatorByVisit = new Map<string, { employeeId: string; license: string | null }>();
  for (const visitId of visitIds) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visit = (visits ?? []).find((v: any) => v.id === visitId);
    const crewId = visit ? effectiveVisitCrewId(visit) : null;
    if (!crewId) continue;
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
    if (!foreman?.employee_id) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: emp } = await (db as any)
      .from("crm_employees")
      .select("applicator_license")
      .eq("id", foreman.employee_id)
      .maybeSingle();
    applicatorByVisit.set(visitId, { employeeId: foreman.employee_id, license: emp?.applicator_license ?? null });
  }

  // The rate the amount was planned from, for rows planned before the label was snapshotted
  // (the compliance report prints it).
  const unlabelled = (rows as { org_id: string; product_id: string | null; application_rate_label: string | null; confirmed_at: string | null }[])
    .filter((r) => !r.confirmed_at && !r.application_rate_label && r.product_id);
  const rateInfoByOrg = new Map<string, Awaited<ReturnType<typeof loadProductRateInfo>>>();
  for (const orgId of [...new Set(unlabelled.map((r) => r.org_id))]) {
    rateInfoByOrg.set(orgId, await loadProductRateInfo(db, orgId, unlabelled.filter((r) => r.org_id === orgId).map((r) => r.product_id as string)));
  }

  const nowIso = new Date().toISOString();
  const itemById = new Map(items.map((i) => [i.id, i]));
  let confirmed = 0;
  for (const row of rows as {
    id: string; org_id: string; visit_id: string | null; product_id: string | null; unit_of_measure_id: string | null;
    application_rate_label: string | null; application_start_time: string | null; application_end_time: string | null;
    chemical_amount: number | null; solution_amount: number | null;
    applicator_employee_id: string | null; applicator_license_number: string | null; confirmed_at: string | null;
  }[]) {
    if (row.confirmed_at) continue;
    const it = itemById.get(row.id)!;
    const rateLabel = !row.application_rate_label && row.product_id
      ? rateInfoByOrg.get(row.org_id)?.get(row.product_id)?.rateLabel ?? null
      : null;
    const visit = row.visit_id ? visitById.get(row.visit_id) : undefined;
    const applicator = row.visit_id ? applicatorByVisit.get(row.visit_id) : undefined;
    // The finished-mix volume was planned for the planned concentrate; keep it in proportion
    // when the crew reports a different amount (it read 12 gal of mix next to 6 oz used).
    const amountChanged = it.used && it.chemicalAmount !== undefined && row.chemical_amount != null
      && row.chemical_amount > 0 && it.chemicalAmount !== row.chemical_amount;
    const scaledSolution = amountChanged && row.solution_amount != null
      ? Math.round(row.solution_amount * (it.chemicalAmount! / row.chemical_amount!) * 100) / 100
      : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (db as any)
      .from("crm_chemical_applications")
      .update({
        used: it.used,
        ...(it.used && it.chemicalAmount !== undefined ? { chemical_amount: it.chemicalAmount } : {}),
        ...(it.used && !row.unit_of_measure_id && it.unitOfMeasureId ? { unit_of_measure_id: it.unitOfMeasureId } : {}),
        ...(rateLabel ? { application_rate_label: rateLabel } : {}),
        ...(scaledSolution !== undefined ? { solution_amount: scaledSolution } : {}),
        ...(it.used && !row.applicator_employee_id && applicator
          ? { applicator_employee_id: applicator.employeeId, applicator_license_number: row.applicator_license_number ?? applicator.license }
          : {}),
        // The compliance record needs when it was applied; the crew's own clock is
        // the best evidence we have (kept if someone already entered one).
        ...(it.used && !row.application_start_time && visit?.clocked_in_at
          ? { application_start_time: visit.clocked_in_at }
          : {}),
        ...(it.used && !row.application_end_time ? { application_end_time: nowIso } : {}),
        // What the crew recorded about the weather / spray water, on the rows actually applied.
        ...(it.used && it.applicationMethodId !== undefined ? { application_method_id: it.applicationMethodId } : {}),
        ...(it.used && it.targetIds !== undefined ? { target_ids: it.targetIds } : {}),
        ...(it.used && it.areasTreatedIds !== undefined ? { areas_treated_ids: it.areasTreatedIds } : {}),
        ...(it.used && conditions?.temperature !== undefined ? { temperature: conditions.temperature } : {}),
        ...(it.used && conditions?.windSpeed !== undefined ? { wind_speed: conditions.windSpeed } : {}),
        ...(it.used && conditions?.windDirection ? { wind_direction: conditions.windDirection } : {}),
        ...(it.used && conditions?.phLevel !== undefined ? { ph_level: conditions.phLevel } : {}),
        confirmed_at: nowIso,
        confirmed_by: user.id,
      })
      .eq("id", row.id)
      // A concurrent confirm (another phone) that landed first wins; this one skips the row.
      .is("confirmed_at", null)
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    confirmed += (updated ?? []).length;
  }

  return NextResponse.json({ confirmed, alreadyConfirmed: alreadyConfirmed + (items.length - alreadyConfirmed - confirmed) });
}

/**
 * GET ?visitIds=a,b — whether the gate applies at this stop: the org's
 * confirmation mode and which of the visits an admin already waived. The server
 * enforces the gate either way; this only lets the UI explain it up front.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const visitIds = (new URL(request.url).searchParams.get("visitIds") ?? "").split(",").filter(Boolean).slice(0, 50);
  if (visitIds.length === 0) return NextResponse.json({ mode: "crew_required", waivedVisitIds: [] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, chemical_confirmation_waived_at")
    .in("id", visitIds)
    .is("deleted_at", null);
  const orgId = (visits ?? [])[0]?.org_id as string | undefined;
  let mode = "crew_required";
  if (orgId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: settings } = await (adminClient() as any)
      .from("crm_chemical_settings")
      .select("confirmation_mode")
      .eq("org_id", orgId)
      .maybeSingle();
    mode = (settings?.confirmation_mode as string | undefined) ?? "crew_required";
  }
  return NextResponse.json({
    mode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    waivedVisitIds: ((visits ?? []) as any[]).filter((v) => v.chemical_confirmation_waived_at).map((v) => v.id),
  });
}
