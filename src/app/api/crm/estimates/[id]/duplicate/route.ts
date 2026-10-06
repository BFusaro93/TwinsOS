import { NextResponse } from "next/server";
import { hasAnySettingsPermission } from "@/lib/auth/settings-permission";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { recalcEstimateTotals } from "@/lib/estimate-calc";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { daysBetweenYmd, shiftYmd, todayInZone } from "@/lib/time/zone";

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

  if (!(await hasAnySettingsPermission(supabase, ["estimate_add"]))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as { description?: string; resetStatus?: boolean };
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
    // stage_id is omitted on purpose: fn_estimates_sync_stage lets a non-null
    // stage_id win over `stage` on INSERT, so copying it would silently put the
    // duplicate back in the source's pipeline stage (Won, Sent, ...) with
    // stage = 'draft' overwritten. Leaving it null makes the trigger derive it
    // from stage = 'draft'.
    stage_id: _stageId,
    reason: _reason,
    ...restFields
  } = src;

  // A copy is a fresh draft: probability follows the draft stage's configured
  // value (not the source's Won/Lost 100%/0%), and the dates re-base to today
  // while keeping the original validity span.
  const { data: draftStage } = await supabase
    .from("crm_estimate_stages")
    .select("probability_bps")
    .eq("org_id", src.org_id)
    .eq("stage_key", "draft")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const today = todayInZone(await getOrgTimeZone(supabase, src.org_id));
  const validUntil: string | null =
    src.valid_until_date && src.estimate_date
      ? shiftYmd(today, Math.max(0, daysBetweenYmd(src.estimate_date, src.valid_until_date)))
      : null;

  const newDescription = body.description ?? `${src.description} (Copy)`;
  const { data: newEst, error: estErr } = await supabase
    .from("estimates")
    .insert({
      ...restFields,
      description: newDescription,
      stage: "draft",
      reason: null,
      ...(draftStage ? { probability_bps: draftStage.probability_bps } : {}),
      estimate_date: today,
      valid_until_date: validUntil,
      // A copy is a fresh draft: nothing about acceptance, deposits, sending or
      // the upsell claim (unique per ticket) carries over from the source.
      upsell_ticket_id: null,
      approval_status: "not_required",
      sent_at: null,
      expiry_notified_at: null,
      portal_accepted_at: null,
      portal_declined_at: null,
      portal_signature_name: null,
      portal_user_id: null,
      deposit_collected_at: null,
      deposit_collected_cents: 0,
      deposit_method: null,
      deposit_notes: null,
      deposit_reference: null,
      deposit_pending_at: null,
      deposit_pending_cents: null,
      deposit_pending_intent_id: null,
      deposit_pending_method: null,
      deposit_failed_at: null,
      deposit_failed_cents: null,
      deposit_failed_method: null,
      deposit_failed_reason: null,
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

  // Any failure below would leave a half-built copy, so soft-delete it first.
  const failAndCleanup = async (message: string) => {
    await supabase
      .from("estimates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", newEst.id);
    return NextResponse.json({ error: message }, { status: 500 });
  };

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
        return failAndCleanup(liErr?.message ?? "Line item insert failed");
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
        if (siErr) return failAndCleanup(siErr.message);
      }
    }
  }

  // Milestone billing plan: copy the plan as fresh pending rows (never the
  // invoice link or invoiced status — the copy has billed nothing). If the plan
  // can't be copied, fall back to installments so the copy isn't left claiming
  // a milestone plan with no milestones.
  if (src.payment_plan_type === "milestones") {
    const { data: milestones, error: msErr } = await supabase
      .from("estimate_milestones")
      .select("*")
      .eq("estimate_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true });
    if (msErr) return failAndCleanup(msErr.message);
    if (milestones?.length) {
      const newMilestones = (milestones as Record<string, unknown>[]).map((m) => {
        const {
          id: _mid,
          created_at: _mca,
          updated_at: _mua,
          deleted_at: _mda,
          org_id: _morg,
          invoice_id: _minv,
          project_id: _mproj,
          status: _mstatus,
          ...mRest
        } = m;
        return {
          ...mRest,
          org_id: newEst.org_id,
          estimate_id: newEst.id,
          project_id: null,
          invoice_id: null,
          status: "pending",
        };
      });
      const { error: insErr } = await supabase.from("estimate_milestones").insert(newMilestones);
      if (insErr) return failAndCleanup(insErr.message);
    } else {
      await supabase.from("estimates").update({ payment_plan_type: "installments" }).eq("id", newEst.id);
    }
  }

  // Fetch and copy direct costs
  const { data: directCosts } = await supabase
    .from("estimate_direct_costs")
    .select("*")
    .eq("estimate_id", id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (directCosts?.length) {
    const newDCs = directCosts.map((dc: Record<string, unknown>) => {
      const { id: _did, created_at: _dca, updated_at: _dua, org_id: _dorg, deleted_at: _ddel, ...dcRest } = dc;
      return { ...dcRest, org_id: newEst.org_id, estimate_id: newEst.id };
    });
    const { error: dcErr } = await supabase.from("estimate_direct_costs").insert(newDCs);
    if (dcErr) return failAndCleanup(dcErr.message);
  }

  // The new estimate row was inserted with all financial aggregates zeroed
  // out (see comment above) on the assumption they'd "recalculate fresh" —
  // but nothing actually recalculates them without this call, so a
  // duplicated estimate was left showing $0 everywhere until some unrelated
  // future edit happened to trigger a recalc.
  await recalcEstimateTotals(supabase, newEst.id);

  return NextResponse.json({ id: newEst.id });
}
