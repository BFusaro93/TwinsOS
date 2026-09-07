/**
 * One-off backfill for `organizations.stripe_connect_livemode` (see
 * supabase/migrations/20260907130000_organizations_stripe_connect_livemode.sql).
 *
 * That column records whether an org's Stripe Connect account
 * (stripe_connect_account_id) was created in Stripe LIVE mode or TEST mode —
 * needed because the platform's STRIPE_SECRET_KEY is a live-mode key, and it
 * can't be used to call a test-mode connected account (Stripe rejects it with
 * "provided key does not have access to account"). Going forward the app sets
 * this itself on every new Connect onboarding and re-sync (see
 * src/lib/stripe/connect.ts and src/app/api/crm/payments/connect/onboarding/route.ts).
 * This script is only for orgs that already had a stripe_connect_account_id
 * BEFORE that column existed.
 *
 * For each org with a stripe_connect_account_id and a null
 * stripe_connect_livemode, it tries `stripe.accounts.retrieve(id)` against
 * the LIVE key first, then the TEST key, and records whichever one actually
 * answers for that account (account.livemode on the returned object).
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> \
 *   STRIPE_SECRET_KEY=<live key> \
 *   STRIPE_SECRET_KEY_TEST=<test key, optional> \
 *   node scripts/backfill-stripe-livemode.mjs
 *
 * Add --dry-run to only print what would be written, without updating the DB.
 *
 * Get the keys from:
 *   - Service Role Key: Vercel dashboard → TwinsOS project → Settings → Environment Variables
 *                       (or Supabase dashboard → Project Settings → API)
 *   - Stripe keys:      Vercel dashboard → TwinsOS project → Settings → Environment Variables
 */

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const SUPABASE_URL = "https://mhphatxiqxbscivffejl.supabase.co";
const DRY_RUN = process.argv.includes("--dry-run");

function cleanKey(val) {
  return (val ?? "").replace(/\\n/g, "").trim();
}

const SERVICE_ROLE_KEY = cleanKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
const LIVE_KEY = cleanKey(process.env.STRIPE_SECRET_KEY);
const TEST_KEY = cleanKey(process.env.STRIPE_SECRET_KEY_TEST);

if (!SERVICE_ROLE_KEY) {
  console.error("Missing env var. Run as:");
  console.error(
    "  SUPABASE_SERVICE_ROLE_KEY=<key> STRIPE_SECRET_KEY=<key> STRIPE_SECRET_KEY_TEST=<key> node scripts/backfill-stripe-livemode.mjs"
  );
  process.exit(1);
}
if (!LIVE_KEY && !TEST_KEY) {
  console.error("Need at least one of STRIPE_SECRET_KEY / STRIPE_SECRET_KEY_TEST set.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const liveStripe = LIVE_KEY ? new Stripe(LIVE_KEY) : null;
const testStripe = TEST_KEY ? new Stripe(TEST_KEY) : null;

async function main() {
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, stripe_connect_account_id, stripe_connect_livemode")
    .not("stripe_connect_account_id", "is", null)
    .is("stripe_connect_livemode", null);

  if (error) {
    console.error("Failed to load organizations:", error);
    process.exit(1);
  }

  if (!orgs || orgs.length === 0) {
    console.log("Nothing to backfill — no orgs with a connect account and an unknown livemode.");
    return;
  }

  console.log(`Found ${orgs.length} org(s) to check.${DRY_RUN ? " (dry run — no writes)" : ""}`);

  for (const org of orgs) {
    const accountId = org.stripe_connect_account_id;
    let resolved = null;

    if (liveStripe) {
      try {
        const account = await liveStripe.accounts.retrieve(accountId);
        resolved = account.livemode;
      } catch (err) {
        // Expected for a test-mode account against the live key — fall through to test key.
        console.log(`  [${org.name}] live key rejected ${accountId} (${err.message}) — trying test key`);
      }
    }

    if (resolved === null && testStripe) {
      try {
        const account = await testStripe.accounts.retrieve(accountId);
        resolved = account.livemode;
      } catch (err) {
        console.error(`  [${org.name}] test key also rejected ${accountId}: ${err.message}`);
      }
    }

    if (resolved === null) {
      console.error(`  [${org.name}] could not resolve livemode for ${accountId} with any configured key — skipping.`);
      continue;
    }

    console.log(`  [${org.name}] ${accountId} → livemode=${resolved}`);

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("organizations")
        .update({ stripe_connect_livemode: resolved })
        .eq("id", org.id);
      if (updateError) {
        console.error(`  [${org.name}] failed to write stripe_connect_livemode:`, updateError);
      }
    }
  }

  console.log("Done.");
}

main();
