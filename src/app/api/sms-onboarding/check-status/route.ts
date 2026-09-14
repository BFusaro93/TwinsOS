import { NextResponse } from "next/server";
import { createClient as createServerClient, createServiceClient } from "@/lib/supabase/server";
import { pollPendingRegistration } from "@/lib/twilio/provisioning";

/**
 * POST /api/sms-onboarding/check-status — lets an org admin manually poll
 * Twilio right now instead of waiting for the hourly /api/cron/twilio-status-check
 * run, for the "did it get approved yet" moment right after a submission.
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
    await pollPendingRegistration(supabase, profile.org_id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Status check failed" }, { status: 500 });
  }

  const { data } = await supabase.from("org_sms_registrations").select("status").eq("org_id", profile.org_id).maybeSingle();
  return NextResponse.json({ status: data?.status ?? "not_started" });
}
