import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { isBillablePlan } from "@/lib/stripe/plans";
import { checkAuthRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { logger } from "@/lib/logger";
import { notifySupportInboxOfTrialSignup } from "@/lib/staff-notify";

const log = logger.child("orgs-create");
const MAX_COMPANY_NAME = 120;

const TRIAL_DAYS = 30;

/**
 * POST /api/orgs/create
 *
 * Public endpoint (no auth required — caller is a prospective new tenant).
 * Creates an organization row using the service role and returns its id.
 * The caller is then expected to call supabase.auth.signUp() on the client
 * side, passing org_id in user_metadata so the handle_new_user trigger
 * auto-creates an admin profile.
 *
 * An optional `plan` picked on the signup form is stored as `pending_plan` —
 * the org itself always starts on plan="trial" (checkout requires an
 * authenticated session, which doesn't exist until email is confirmed), and
 * the app prompts the user straight into checkout for their chosen plan on
 * first login. See (home)/home/page.tsx and SubscriptionTab's autoSubscribe.
 */
export async function POST(request: Request) {
  // Unauthenticated + service-role insert: throttle per IP so it can't be
  // used to mass-create tenants.
  const allowed = await checkAuthRateLimit(`org-create:ip:${getClientIp(request)}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  let body: { companyName?: string; plan?: string; contactName?: string; contactEmail?: string; contactPhone?: string; timezone?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const companyName = typeof body?.companyName === "string" ? body.companyName.trim() : "";
  if (!companyName) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }
  if (companyName.length > MAX_COMPANY_NAME) {
    return NextResponse.json({ error: `Company name must be ${MAX_COMPANY_NAME} characters or fewer` }, { status: 400 });
  }

  const pendingPlan = body.plan && isBillablePlan(body.plan) ? body.plan : null;

  // The signup form sends the browser's zone so a Pacific/Central company doesn't run on Eastern
  // day boundaries until someone finds the setting. Anything Intl can't resolve is ignored.
  let timezone: string | null = null;
  if (typeof body.timezone === "string" && body.timezone.length <= 64) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
      timezone = body.timezone;
    } catch { /* unknown zone: keep the column default */ }
  }
  // Replies to invoice/estimate/automated email go to the owner until they set a company address.
  const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) && contactEmail.length <= 254 ? contactEmail : null;

  // Service role is required — the organizations table is RLS-protected and
  // anonymous users cannot insert rows directly.
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Generate a URL-safe slug from the company name and append a random suffix
  // to avoid collisions on the UNIQUE constraint.
  const baseSlug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  const slug = `${baseSlug || "org"}-${randomBytes(4).toString("hex")}`;

  const orgRow = {
    name: companyName,
    slug,
    pending_plan: pendingPlan,
    // The column defaults (7% tax, card surcharge on) were set for the first customer; a new
    // company starts with no tax and no surcharge and opts in from Settings.
    tax_rate_percent: 0,
    cc_processing_fee_enabled: false,
    cc_processing_fee_bps: 300,
    ...(timezone ? { timezone } : {}),
    ...(replyTo ? { customizations: { reply_to_email: replyTo } } : {}),
    // No column default — without this a new org's trial never expires
    // (use-trial-status treats a null trial_ends_at as open-ended).
    trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
  };
  // per_org_numbering numbers invoices/estimates/tickets from 1 instead of the global counters. It
  // comes from migration 20261130001600; if that isn't applied to this database yet (undefined
  // column, 42703), create the org without it rather than failing signup.
  let { data: org, error: orgErr } = await adminClient
    .from("organizations")
    .insert({ ...orgRow, per_org_numbering: true })
    .select("id")
    .single();
  if (orgErr?.code === "42703") {
    ({ data: org, error: orgErr } = await adminClient.from("organizations").insert(orgRow).select("id").single());
  }

  if (orgErr || !org) {
    log.error("organization insert failed", { error: orgErr?.message });
    return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
  }

  // Tell support who signed up. Best-effort and awaited so the serverless
  // function isn't frozen mid-send; a failure never blocks the signup.
  await notifySupportInboxOfTrialSignup({
    companyName,
    contactName: typeof body.contactName === "string" ? body.contactName.trim().slice(0, 120) || null : null,
    contactEmail: typeof body.contactEmail === "string" ? body.contactEmail.trim().slice(0, 200) || null : null,
    contactPhone: typeof body.contactPhone === "string" ? body.contactPhone.trim().slice(0, 30) || null : null,
    plan: pendingPlan,
  }).catch(() => false);

  return NextResponse.json({ orgId: org.id }, { status: 200 });
}
