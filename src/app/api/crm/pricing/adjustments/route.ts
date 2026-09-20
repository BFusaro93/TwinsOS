import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  applyPriceAdjustmentSchema,
  ADJUST_TARGETS,
  type AdjustTarget,
  type PriceAdjustmentRun,
} from "@/types/crm-pricing";
import { authorizePricing } from "@/lib/pricing/authorize";
import { logger } from "@/lib/logger";

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRun(row: any): PriceAdjustmentRun {
  const targets = (Array.isArray(row.targets) ? row.targets : []).filter(
    (t: string): t is AdjustTarget => (ADJUST_TARGETS as readonly string[]).includes(t)
  );
  const scope = (row.scope ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    method: row.method,
    amount: Number(row.amount),
    rounding: row.rounding,
    targets,
    scope: {
      serviceIds: (scope.serviceIds as string[]) ?? [],
      clientIds: (scope.clientIds as string[]) ?? [],
      jobTypes: (scope.jobTypes as string[]) ?? [],
      packageIds: (scope.packageIds as string[]) ?? [],
    },
    status: row.status,
    lineCount: row.line_count,
    deltaCents: Number(row.delta_cents),
    notes: row.notes ?? null,
    appliedAt: row.applied_at,
    revertedAt: row.reverted_at ?? null,
  };
}

/** GET — the org's run history, newest first. */
export async function GET() {
  const supabase = await getClient();
  const denied = await authorizePricing(supabase);
  if (denied) return denied;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("crm_price_adjustments")
    .select("*")
    .is("deleted_at", null)
    .order("applied_at", { ascending: false })
    .limit(100);

  if (error) {
    logger.error("[pricing/adjustments] list failed", { error: error.message });
    return NextResponse.json({ error: "Failed to load price adjustments" }, { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ runs: (data ?? []).map((r: any) => mapRun(r)) });
}

/** POST — apply a run. The RPC recomputes prices itself; nothing the client
 *  sends is trusted as a price. */
export async function POST(request: Request) {
  const supabase = await getClient();
  const denied = await authorizePricing(supabase);
  if (denied) return denied;

  const parsed = applyPriceAdjustmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, method, amount, rounding, scope, targets, notes, selected } = parsed.data;

  // The RPC recomputes every price itself and writes only the selected rows
  // whose live price still equals what the preview showed — so a row edited in
  // the meantime is skipped rather than re-priced from a number the user never
  // approved, and rows that appeared after the preview are never swept in.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runId, error } = await (supabase.rpc as any)("crm_apply_price_adjustment", {
    p_name: name,
    p_method: method,
    p_amount: amount,
    p_rounding: rounding,
    p_scope: scope,
    p_targets: targets,
    p_notes: notes ?? null,
    p_selected: selected.map((l) => ({
      entity_type: l.entityType,
      entity_id: l.entityId,
      old_rate_cents: l.oldRateCents,
    })),
  });

  if (error) {
    // The RPC raises when nothing selected still matches, which is the user's
    // problem to see and act on, not a server fault.
    if (/still match the preview/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "None of the lines you selected still match the preview — their prices " +
            "changed in the meantime. Preview again and check before applying.",
        },
        { status: 409 }
      );
    }
    logger.error("[pricing/adjustments] apply failed", { error: error.message });
    return NextResponse.json({ error: "Failed to apply the adjustment" }, { status: 500 });
  }

  // Read back what actually landed: fewer than selected means some rows drifted
  // between preview and apply and were deliberately skipped.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: run } = await (supabase as any)
    .from("crm_price_adjustments")
    .select("line_count")
    .eq("id", runId)
    .maybeSingle();

  const lineCount = (run?.line_count as number | undefined) ?? selected.length;
  return NextResponse.json({
    id: runId,
    lineCount,
    skipped: Math.max(0, selected.length - lineCount),
  });
}
