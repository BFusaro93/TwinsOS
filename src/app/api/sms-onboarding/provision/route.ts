import { NextResponse } from "next/server";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { advanceRegistration } from "@/lib/twilio/provisioning";
import { logger } from "@/lib/logger";

const log = logger.child("sms-onboarding provision");

/**
 * POST /api/sms-onboarding/provision — advances the calling org's
 * registration by exactly one step (see advanceRegistration()). Runs under
 * the service client for the actual Twilio calls since they touch
 * org_sms_registrations columns no org-scoped RLS policy should ever let a
 * client write directly (subaccount SID, API key SID, vault secret ID) —
 * auth/authorization is enforced here, before handing off.
 */
export async function POST() {
  const authed = await createServerClient();
  const {
    data: { user },
    error: authErr,
  } = await authed.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await authed.from("profiles").select("org_id, role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const supabase = createServiceClient();
  try {
    const result = await advanceRegistration(supabase, profile.org_id);
    return NextResponse.json(result);
  } catch (err) {
    log.error("provisioning step failed", { orgId: profile.org_id, error: err instanceof Error ? err.message : err });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Provisioning step failed" }, { status: 500 });
  }
}
