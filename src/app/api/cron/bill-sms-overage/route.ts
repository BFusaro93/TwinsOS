import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { billSmsOverageForPeriod } from "@/lib/stripe/sms-billing";
import { logger } from "@/lib/logger";

const log = logger.child("cron bill-sms-overage");

/**
 * GET /api/cron/bill-sms-overage — called daily by Vercel Cron.
 *
 * The SMS add-on's 500-included/$10-per-250-over structure doesn't map onto
 * a native Stripe metered price cleanly (see sms-billing.ts), so overage is
 * billed as a one-off invoice item instead. Usage accumulates all month via
 * increment_sms_usage() on every send (src/lib/sms/send.ts); this reconciles
 * each org with the SMS add-on enabled against the current period's count
 * and bills only the newly-owed delta, so running it daily as usage climbs
 * never double-bills.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ skipped: "Stripe not configured" });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const stripe = getStripe();

  const periodStart = new Date();
  periodStart.setUTCDate(1);
  const periodStartStr = periodStart.toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: addonRows, error } = await (supabase as any)
    .from("organization_addons")
    .select("org_id, organizations(id, stripe_customer_id)")
    .eq("addon_key", "sms")
    .eq("enabled", true);
  if (error) {
    log.error("failed to list orgs with SMS addon enabled", { error });
    return NextResponse.json({ error: "Failed to list SMS-enabled orgs" }, { status: 500 });
  }

  let billed = 0;
  let failed = 0;
  for (const row of addonRows ?? []) {
    const org = row.organizations;
    if (!org) continue;
    try {
      const { data: usage } = await supabase
        .from("organization_sms_usage")
        .select("period_start, count, overage_billed_cents")
        .eq("org_id", org.id)
        .eq("period_start", periodStartStr)
        .maybeSingle();
      if (!usage) continue; // no sends yet this period
      await billSmsOverageForPeriod(stripe, supabase, org, usage);
      billed++;
    } catch (err) {
      failed++;
      log.error("failed to bill SMS overage for org", { error: err, orgId: org.id });
    }
  }

  return NextResponse.json({ billed, failed });
}
