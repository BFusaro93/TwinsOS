import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

const log = logger.child("internal platform fees");

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  orgId: z.string().uuid(),
  // Basis points of the amount charged (10 = 0.1%). Capped at 1% by a DB CHECK too.
  platformFeeBps: z.number().int().min(0).max(100),
});

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: isStaff } = await supabase.rpc("is_staff", { uid: user.id });
  if (!isStaff) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { user };
}

/** Staff-only: every org with its current platform fee and Stripe Connect status. */
export async function GET() {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceClient().from("organizations") as any)
    .select("id, name, platform_fee_bps, stripe_connect_account_id, stripe_connect_charges_enabled")
    .order("name");
  if (error) {
    log.error("failed to list orgs", { error });
    return NextResponse.json({ error: "Couldn't load organizations" }, { status: 500 });
  }
  return NextResponse.json({
    orgs: (data ?? []).map(
      (o: {
        id: string;
        name: string;
        platform_fee_bps: number;
        stripe_connect_account_id: string | null;
        stripe_connect_charges_enabled: boolean | null;
      }) => ({
        id: o.id,
        name: o.name,
        platformFeeBps: o.platform_fee_bps,
        stripeConnected: !!o.stripe_connect_account_id && !!o.stripe_connect_charges_enabled,
      })
    ),
  });
}

/** Staff-only: set one org's platform fee. Applies to charges created after the change. */
export async function PATCH(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { orgId, platformFeeBps } = parsed.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (createServiceClient().from("organizations") as any)
    .update({ platform_fee_bps: platformFeeBps })
    .eq("id", orgId)
    .select("id, platform_fee_bps")
    .single();
  if (error || !data) {
    log.error("failed to update platform fee", { error, orgId });
    return NextResponse.json({ error: "Couldn't update the fee" }, { status: 500 });
  }
  log.info("platform fee changed", { orgId, platformFeeBps, staffUserId: auth.user.id });
  return NextResponse.json({ ok: true, platformFeeBps: data.platform_fee_bps });
}
