import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getEffectiveOrgId } from "@/lib/supabase/effective-org";
import { drainIntentCancellations } from "@/lib/stripe/open-intent";

/**
 * POST /api/crm/payments/cancel-stale-intents — called (fire-and-forget) after
 * staff record a payment, void or delete an invoice. Those writes go straight
 * to the database, whose trigger queues any customer pay form they made stale;
 * this cancels the queued intents at Stripe now instead of waiting for the
 * 5-minute sweep. Only ever touches the caller's own org's queue, and only
 * cancels forms a customer hasn't submitted yet — see lib/stripe/open-intent.ts.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });
  const orgId = (await getEffectiveOrgId(supabase)) ?? profile.org_id;
  if (!orgId) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const result = await drainIntentCancellations(createServiceClient(), { orgId, limit: 25 });
  return NextResponse.json({ ok: true, ...result });
}
