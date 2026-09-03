import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";

const businessInfoSchema = z.object({
  legal_business_name: z.string().min(1),
  ein: z.string().min(1),
  business_type: z.enum(["sole_proprietorship", "partnership", "llc", "corporation", "nonprofit"]),
  business_industry: z.string().min(1),
  business_website: z.string().url(),
  business_address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    region: z.string().min(1),
    postal_code: z.string().min(1),
    iso_country: z.string().min(2).max(2),
  }),
  business_regions_of_operation: z.enum(["usa_and_canada", "usa_only"]),
  contact_first_name: z.string().min(1),
  contact_last_name: z.string().min(1),
  contact_email: z.string().email(),
  contact_phone: z.string().min(1),
  support_email: z.string().email(),
  support_phone: z.string().min(1),
  opt_in_website_url: z.string().url(),
  opt_in_checkbox_label: z.string().min(1),
  verbal_opt_in_script: z.string().min(1),
});

async function requireOrgAdmin(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;

  const { data: profile } = await supabase.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return { error: NextResponse.json({ error: "Admin role required" }, { status: 403 }) } as const;
  }
  return { userId: user.id, orgId: profile.org_id } as const;
}

/** GET /api/sms-onboarding — the calling org's current SMS registration (business info + provisioning status). */
export async function GET() {
  const supabase = await createServerClient();
  const ctx = await requireOrgAdmin(supabase);
  if ("error" in ctx) return ctx.error;

  const { data, error } = await supabase
    .from("org_sms_registrations")
    .select(
      "legal_business_name, ein, business_type, business_industry, business_website, business_address, business_regions_of_operation, contact_first_name, contact_last_name, contact_email, contact_phone, support_email, support_phone, opt_in_website_url, opt_in_checkbox_label, verbal_opt_in_script, status, twilio_phone_number, twilio_brand_failure_reason, twilio_campaign_failure_reason, last_synced_at"
    )
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ registration: data });
}

/**
 * POST /api/sms-onboarding — saves (or edits, if rejected) the org's business
 * info and consent copy. Purely a data save — kicking off Twilio
 * provisioning is a separate explicit action (POST /api/sms-onboarding/provision)
 * so an admin can review what will be submitted before anything reaches Twilio.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const ctx = await requireOrgAdmin(supabase);
  if ("error" in ctx) return ctx.error;

  const parsed = businessInfoSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("org_sms_registrations")
    .select("status")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  // A rejection only invalidates the step that failed — resetting further
  // back than that would needlessly re-create a subaccount or re-submit an
  // already-approved profile. Only fields for the failed step (and anything
  // after it) actually change on resubmit, so keeping earlier state is safe.
  const resetTarget: Record<string, string> = {
    not_started: "not_started",
    profile_rejected: "subaccount_created",
    brand_rejected: "profile_approved",
    campaign_rejected: "brand_approved",
  };
  const status = existing?.status ?? "not_started";
  if (!(status in resetTarget)) {
    return NextResponse.json(
      { error: `Cannot edit business info while status is "${status}" — already submitted to Twilio` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("org_sms_registrations").upsert(
    {
      org_id: ctx.orgId,
      created_by: ctx.userId,
      ...parsed.data,
      status: resetTarget[status],
    },
    { onConflict: "org_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
