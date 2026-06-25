import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
    const newLineItems = lineItems.map((li: Record<string, unknown>) => {
      const { id: _lid, created_at: _lca, updated_at: _lua, deleted_at: _lda, org_id: _lorg, ...liRest } = li;
      return {
        ...liRest,
        org_id: newEst.org_id,
        estimate_id: newEst.id,
        status: resetStatus ? "quote" : li.status,
      };
    });
    const { error: liErr } = await supabase.from("estimate_line_items").insert(newLineItems);
    if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 });
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

  return NextResponse.json({ id: newEst.id });
}
