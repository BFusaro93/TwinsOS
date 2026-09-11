import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";
import { authorizePricing } from "@/lib/pricing/authorize";
import { logger } from "@/lib/logger";

const ParamsSchema = z.object({ id: z.string().uuid() });

/** POST — undo a run, restoring each line's original price. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const denied = await authorizePricing(supabase);
  if (denied) return denied;

  const parsed = ParamsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid adjustment id" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("crm_revert_price_adjustment", {
    p_id: parsed.data.id,
  });

  if (error) {
    logger.error("[pricing/adjustments/revert] failed", { error: error.message });
    // The RPC raises for "not found" and "already reverted" — both are the
    // caller's problem to see, not a server fault.
    const message = /already reverted|not found/i.test(error.message)
      ? error.message.replace(/^.*?:\s*/, "")
      : "Failed to revert the adjustment";
    const status = /already reverted|not found/i.test(error.message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { reverted: number; skipped: number }
    | undefined;

  return NextResponse.json({
    reverted: row?.reverted ?? 0,
    skipped: row?.skipped ?? 0,
  });
}
