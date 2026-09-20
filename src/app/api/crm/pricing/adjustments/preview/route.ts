import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  previewPriceAdjustmentSchema,
  ADJUST_TARGETS,
  type AdjustTarget,
  type PriceAdjustmentCandidate,
  type PriceAdjustmentPreview,
} from "@/types/crm-pricing";
import { authorizePricing } from "@/lib/pricing/authorize";
import { logger } from "@/lib/logger";

/** POST — dry-run a price adjustment. Writes nothing. */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const denied = await authorizePricing(supabase);
  if (denied) return denied;

  const parsed = previewPriceAdjustmentSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { method, amount, rounding, scope, targets } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("crm_price_adjustment_candidates", {
    p_method: method,
    p_amount: amount,
    p_rounding: rounding,
    p_scope: scope,
    p_targets: targets,
  });

  if (error) {
    logger.error("[pricing/adjustments/preview] failed", { error: error.message });
    return NextResponse.json({ error: "Failed to build the preview" }, { status: 500 });
  }

  const emptyByTarget = () =>
    Object.fromEntries(ADJUST_TARGETS.map((t) => [t, 0])) as Record<AdjustTarget, number>;

  const candidates: PriceAdjustmentCandidate[] = (
    (data ?? []) as {
      entity_type: AdjustTarget;
      entity_id: string;
      client_id: string | null;
      job_id: string | null;
      label: string;
      old_rate_cents: number;
      new_rate_cents: number;
    }[]
  ).map((r) => ({
    entityType: r.entity_type,
    entityId: r.entity_id,
    clientId: r.client_id,
    jobId: r.job_id,
    label: r.label,
    oldRateCents: r.old_rate_cents,
    newRateCents: r.new_rate_cents,
  }));

  const changed = candidates.filter((c) => c.newRateCents !== c.oldRateCents);
  const countsByTarget = emptyByTarget();
  const deltaByTarget = emptyByTarget();
  for (const c of changed) {
    countsByTarget[c.entityType] += 1;
    deltaByTarget[c.entityType] += c.newRateCents - c.oldRateCents;
  }

  const preview: PriceAdjustmentPreview = {
    // Changed rows first so the meaningful ones are visible without scrolling.
    candidates: [
      ...changed,
      ...candidates.filter((c) => c.newRateCents === c.oldRateCents),
    ],
    changedCount: changed.length,
    unchangedCount: candidates.length - changed.length,
    deltaCents: changed.reduce((s, c) => s + (c.newRateCents - c.oldRateCents), 0),
    countsByTarget,
    deltaByTarget,
  };

  return NextResponse.json(preview);
}
