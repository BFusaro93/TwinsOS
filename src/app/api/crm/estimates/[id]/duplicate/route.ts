import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recalcEstimateTotals } from "@/lib/estimate-calc";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  ) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { description?: string; resetStatus?: boolean };
  const { resetStatus = true } = body;

  // Fetch source estimate
  const { data: src, error: srcErr } = await supabase
    .from("estimates")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (srcErr || !src) return NextResponse.json({ error: "Estimate not found" }, { status: 404 });

  // Build new estimate row (omit id, estimate_number serial, audit fields, stage/reason reset)
  const {
    id: _id,
    estimate_number: _num,
    created_at: _ca,
    updated_at: _ua,
    created_by: _cb,
    deleted_at: _da,
    stage: _stage,
    reason: _reason,
    ...restFields
  } = src;

  const newDescription = body.description ?? `${src.description} (Copy)`;
  const { data: newEst, error: estErr } = await supabase
    .from("estimates")
    .insert({
      ...restFields,
      description: newDescription,
      stage: "draft",
      reason: null,
      // reset financial aggregates so they recalculate fresh
      subtotal_cents: 0,
      discount_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      revenue_cents: 0,
      overhead_cost_cents: 0,
      gross_profit_cents: 0,
      net_profit_cents: 0,
      total_budgeted_hours: 0,
    })
    .select()
    .single();
  if (estErr || !newEst) {
    return NextResponse.json({ error: estErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // Fetch source line items (non-deleted)
  const { data: lineItems } = await supabase
    .from("estimate_line_items")
    .select("*")
    .eq("estimate_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (lineItems?.length) {
    // Insert one at a time so each new id can be paired with its source id —
    // a bulk insert's response order isn't guaranteed to match the input
    // order, and sort_order isn't guaranteed unique within an estimate.
    const newIdByOldId = new Map<string, string>();
    for (const li of lineItems as Record<string, unknown>[]) {
      const { id: oldLid, created_at: _lca, updated_at: _lua, deleted_at: _lda, org_id: _lorg, ...liRest } = li;
      const { data: insertedLi, error: liErr } = await supabase
        .from("estimate_line_items")
        .insert({
          ...liRest,
          org_id: newEst.org_id,
          estimate_id: newEst.id,
          status: resetStatus ? "quote" : li.status,
        })
        .select("id")
        .single();
      if (liErr || !insertedLi) {
        return NextResponse.json({ error: liErr?.message ?? "Line item insert failed" }, { status: 500 });
      }
      newIdByOldId.set(oldLid as string, insertedLi.id);
    }

    const { data: subitems } = await supabase
      .from("estimate_line_item_subitems")
      .select("*")
      .in("line_item_id", lineItems.map((li: Record<string, unknown>) => li.id as string))
      .is("deleted_at", null);

    if (subitems?.length) {
      const newSubitems = (subitems as Record<string, unknown>[])
        .map((si) => {
          const newLineItemId = newIdByOldId.get(si.line_item_id as string);
          if (!newLineItemId) return null;
          const { id: _sid, created_at: _sca, deleted_at: _sda, org_id: _sorg, line_item_id: _slid, ...siRest } = si;
          return { ...siRest, org_id: newEst.org_id, line_item_id: newLineItemId };
        })
        .filter((si) => si !== null) as Record<string, unknown>[];
      if (newSubitems.length) {
        const { error: siErr } = await supabase.from("estimate_line_item_subitems").insert(newSubitems);
        if (siErr) return NextResponse.json({ error: siErr.message }, { status: 500 });
      }
    }
  }

  // Fetch and copy direct costs
  const { data: directCosts } = await supabase
    .from("estimate_direct_costs")
    .select("*")
    .eq("estimate_id", id)
    .order("sort_order", { ascending: true });

  if (directCosts?.length) {
    const newDCs = directCosts.map((dc: Record<string, unknown>) => {
      const { id: _did, created_at: _dca, updated_at: _dua, org_id: _dorg, ...dcRest } = dc;
      return { ...dcRest, org_id: newEst.org_id, estimate_id: newEst.id };
    });
    const { error: dcErr } = await supabase.from("estimate_direct_costs").insert(newDCs);
    if (dcErr) return NextResponse.json({ error: dcErr.message }, { status: 500 });
  }

  // The new estimate row was inserted with all financial aggregates zeroed
  // out (see comment above) on the assumption they'd "recalculate fresh" —
  // but nothing actually recalculates them without this call, so a
  // duplicated estimate was left showing $0 everywhere until some unrelated
  // future edit happened to trigger a recalc.
  await recalcEstimateTotals(supabase, newEst.id);

  return NextResponse.json({ id: newEst.id });
}
