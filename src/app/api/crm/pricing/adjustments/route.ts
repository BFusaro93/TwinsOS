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
  const { name, method, amount, rounding, scope, targets, notes, expectedLineCount } = parsed.data;

  // Re-run the candidate query before writing. If the set has moved since the
  // user previewed it — a job created, a rate edited, a package archived — the
  // number they approved is no longer the number that would be written, so
  // stop and make them look again rather than silently re-pricing more (or
  // fewer) rows than they signed off on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: candidates, error: previewError } = await (supabase.rpc as any)(
    "crm_price_adjustment_candidates",
    { p_method: method, p_amount: amount, p_rounding: rounding, p_scope: scope, p_targets: targets }
  );
  if (previewError) {
    logger.error("[pricing/adjustments] re-preview failed", { error: previewError.message });
    return NextResponse.json({ error: "Failed to verify the adjustment" }, { status: 500 });
  }

  const changed = ((candidates ?? []) as { old_rate_cents: number; new_rate_cents: number }[])
    .filter((c) => c.new_rate_cents !== c.old_rate_cents).length;

  if (changed !== expectedLineCount) {
    return NextResponse.json(
      {
        error:
          `This would now change ${changed} line${changed !== 1 ? "s" : ""}, not the ` +
          `${expectedLineCount} shown in your preview. Something changed in the meantime — ` +
          `re-run the preview and check it before applying.`,
        actualLineCount: changed,
      },
      { status: 409 }
    );
  }

  if (changed === 0) {
    return NextResponse.json(
      { error: "Nothing to change — this adjustment moves no prices." },
      { status: 422 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runId, error } = await (supabase.rpc as any)("crm_apply_price_adjustment", {
    p_name: name,
    p_method: method,
    p_amount: amount,
    p_rounding: rounding,
    p_scope: scope,
    p_targets: targets,
    p_notes: notes ?? null,
  });

  if (error) {
    logger.error("[pricing/adjustments] apply failed", { error: error.message });
    return NextResponse.json({ error: "Failed to apply the adjustment" }, { status: 500 });
  }

  return NextResponse.json({ id: runId, lineCount: changed });
}
