import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { pollPendingRegistration } from "@/lib/twilio/provisioning";
import { logger } from "@/lib/logger";

const log = logger.child("cron twilio-status-check");

const PENDING_STATUSES = ["profile_submitted", "brand_submitted", "campaign_submitted"];

/**
 * GET /api/cron/twilio-status-check — Twilio has no webhook for Trust Hub
 * Customer Profile / Brand / Campaign review outcomes, so this polls every
 * org sitting in one of the three async-review statuses and advances it on
 * approval or rejection. See provisioning.ts's pollPendingRegistration().
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: pending, error } = await supabase
    .from("org_sms_registrations")
    .select("org_id, status")
    .in("status", PENDING_STATUSES)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.allSettled((pending ?? []).map((r: { org_id: string }) => pollPendingRegistration(supabase, r.org_id)));

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    log.error("some polls failed", { count: failures.length, total: results.length });
  }

  return NextResponse.json({ checked: results.length, failed: failures.length });
}
