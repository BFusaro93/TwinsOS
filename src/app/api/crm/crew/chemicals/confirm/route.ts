import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";

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
});
const Body = z.object({ items: z.array(Item).min(1).max(50) });

export async function POST(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { items } = parsed.data;

  for (const it of items) {
    if (it.used && it.chemicalAmount === undefined) {
      return NextResponse.json({ error: "Enter the amount used, or mark it Not used" }, { status: 400 });
    }
  }

  const db = adminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error: rowsError } = await (db as any)
    .from("crm_chemical_applications")
    .select("id, org_id, visit_id, application_start_time, application_end_time")
    .in("id", items.map((i) => i.id))
    .is("deleted_at", null);
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });
  if ((rows ?? []).length !== items.length) {
    return NextResponse.json({ error: "Chemical entry not found" }, { status: 404 });
  }

  // The rows were read with the service role (no org scoping), so ownership is
  // proven only through each row's visit. A row with no visit has nothing to
  // prove it against — it must not be confirmable by any signed-in user.
  if ((rows as { visit_id: string | null }[]).some((r) => !r.visit_id)) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }
  const visitIds = [...new Set((rows as { visit_id: string | null }[]).map((r) => r.visit_id).filter((v): v is string => !!v))];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visits } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, org_id, crew_id, crew_unassigned, clocked_in_at, crm_jobs(crew_id)")
    .in("id", visitIds)
    .is("deleted_at", null);
  const visitById = new Map<string, { id: string; org_id: string; clocked_in_at: string | null }>(
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

  const nowIso = new Date().toISOString();
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const row of rows as { id: string; visit_id: string | null; application_start_time: string | null; application_end_time: string | null }[]) {
    const it = itemById.get(row.id)!;
    const visit = row.visit_id ? visitById.get(row.visit_id) : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db as any)
      .from("crm_chemical_applications")
      .update({
        used: it.used,
        ...(it.used && it.chemicalAmount !== undefined ? { chemical_amount: it.chemicalAmount } : {}),
        // The compliance record needs when it was applied; the crew's own clock is
        // the best evidence we have (kept if someone already entered one).
        ...(it.used && !row.application_start_time && visit?.clocked_in_at
          ? { application_start_time: visit.clocked_in_at }
          : {}),
        ...(it.used && !row.application_end_time ? { application_end_time: nowIso } : {}),
        confirmed_at: nowIso,
        confirmed_by: user.id,
      })
      .eq("id", row.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ confirmed: items.length });
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
