import { NextResponse } from "next/server";
import { z } from "zod";
import { getRouteAuth, assertCallerOwnsVisit } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";
import { createRequisitionRecord } from "@/lib/requisitions/create-requisition";
import { REQUISITION_SELECT, shapeRequisition } from "@/app/api/v1/requisitions/shape";

const Body = z.object({
  productItemId: z.string().uuid(),
  quantity: z.number().int().positive(),
  note: z.string().max(2000).optional(),
});

/**
 * POST /api/crm/crew/visits/:visitId/requisitions — crew-app's "Request
 * Materials" action (crew-app/src/app/(app)/visit/[id].tsx via
 * requestMaterials() in crew-app/src/lib/api.ts, queued through the offline
 * queue as a 'request_materials' item — see crew-app/src/lib/offline/
 * sync-engine.ts). Creates a single-line draft Requisition linked to the
 * visit's CRM job via requisitions.crm_job_id (added in
 * supabase/migrations/20260825134117_requisitions_crm_job_id.sql — the
 * crm_job analog of work_order_id), the same pattern as a Work Order
 * spawning a Requisition (CLAUDE.md integration point #1/#5).
 *
 * Per CLAUDE.md, every requisition line item must reference a product_items
 * catalog entry — there is no free-text item field here. The picker on the
 * mobile side (GET /api/crm/crew/products) is filtered to
 * stocked_material/project_material; this route re-enforces that server-side
 * since the API is the actual trust boundary, not the mobile UI.
 *
 * No true request-level idempotency: the Idempotency-Key header the offline
 * sync engine sends is accepted but not (yet) used to dedupe, unlike
 * clock-in/out. A retried request after a flaky partial success could create
 * a second draft requisition for the same field ask. That's judged
 * acceptable here — unlike a clock action, a duplicate draft requisition
 * doesn't corrupt payroll or double-charge anything; it's a cheap row an
 * office/admin user notices and deletes when reviewing the Requisitions
 * list. A future improvement would add an idempotency_key column the way
 * some other tables in this schema do.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productItemId, quantity, note } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, job_id, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // product_items reads are not restricted for crew role by RLS (only the
  // procurement write-side is — see 20260824114014_restrict_crew_role_
  // from_financial_tables.sql), so this validation lookup can use the
  // caller's own session client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: product, error: productError } = await (supabase as any)
    .from("product_items")
    .select("id, org_id, name, part_number, unit_cost, category")
    .eq("id", productItemId)
    .maybeSingle();
  if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
  if (!product || product.org_id !== visit.org_id) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (product.category === "maintenance_part") {
    return NextResponse.json(
      { error: "Field material requests are limited to stocked or project materials" },
      { status: 400 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();
  const requestedByName = (profile?.name as string | undefined)?.trim() || user.email || "Crew member";

  // requisitions/requisition_line_items INSERT is blocked for crew-role
  // sessions by RLS (org_members_requisitions excludes role='crew') — an
  // intentional lockdown of the office-facing PO/requisition surface for a
  // shared field-tablet login (see the migration referenced above). A field
  // materials request is a legitimate, narrow exception to that lockdown,
  // so this route writes with the service-role client instead of the
  // caller's session, after doing all org/category validation above with
  // the caller's own RLS-scoped client.
  const db = adminClient();
  const { requisition, error } = await createRequisitionRecord(
    db,
    {
      orgId: visit.org_id as string,
      title: `Field request: ${product.name as string}`,
      crmJobId: visit.job_id as string,
      requestedById: user.id,
      requestedByName,
      notes: note ?? null,
      lineItems: [{ productItemId, quantity }],
    },
    new Map([[product.id as string, product]])
  );
  if (error || !requisition) return NextResponse.json({ error: error ?? "create failed" }, { status: 500 });

  return NextResponse.json(shapeRequisition(requisition), { status: 201 });
}

/**
 * GET /api/crm/crew/visits/:visitId/requisitions — status list for "My
 * Requests" on the visit screen (crew-app's requestMaterials flow above).
 * Returns every requisition linked to this visit's CRM job (not just ones
 * this route itself created — e.g. also anything the office created
 * against the same job), newest first.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ visitId: string }> }
) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { visitId } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: visit, error: visitError } = await (supabase as any)
    .from("crm_job_visits")
    .select("id, job_id, org_id, crew_id")
    .eq("id", visitId)
    .is("deleted_at", null)
    .maybeSingle();
  if (visitError) return NextResponse.json({ error: visitError.message }, { status: 500 });
  if (!visit) return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  if (!(await assertCallerOwnsVisit(supabase, user.id, visit.org_id, visit.crew_id))) {
    return NextResponse.json({ error: "Not assigned to this visit" }, { status: 403 });
  }

  // Same RLS gap as POST above — crew can SELECT their own visit (not
  // blocked) but not requisitions, so this list read also goes through the
  // service-role client, explicitly scoped to the org+job already verified
  // via the caller's own session above.
  const db = adminClient();
  const { data, error } = await db
    .from("requisitions")
    .select(REQUISITION_SELECT)
    .eq("org_id", visit.org_id as string)
    .eq("crm_job_id", visit.job_id as string)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json((data ?? []).map((row: any) => shapeRequisition(row)));
}
