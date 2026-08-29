import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { isEligibleForEnrollment, enrollClientInSequence, triggerConditionsMet } from "@/lib/automations/sequence-enrollment";

/**
 * GET  /api/crm/sales-meetings/automation-date-triggers — called every 15
 * minutes by a GitHub Actions workflow (Vercel Hobby caps cron at once/day,
 * see .github/workflows/sales-meeting-reminders-cron.yml).
 * POST — manual trigger for testing.
 *
 * Evaluates the 'sales_meeting_reminder' date-gap automation trigger type
 * (mirrors /api/crm/estimates/automation-date-triggers) and enrolls the
 * meeting's client into the trigger's sequence once the meeting falls within
 * that trigger's configured `minutes` lead time. This does NOT send
 * anything itself — it only creates rows in crm_sequence_enrollments, which
 * /api/automations/run then processes like any other enrollment.
 *
 * A meeting with no client (a new-lead meeting) can't be enrolled — the
 * automations engine is entirely client-scoped. The rep still gets notified
 * directly by /api/cron/sales-meeting-reminders regardless of client_id.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = ReturnType<typeof createClient<any>>;

export async function GET(request: Request) {
  return handleRun(request);
}

export async function POST(request: Request) {
  return handleRun(request);
}

async function handleRun(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase: AdminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date();

  const { data: triggers } = await supabase
    .from("crm_sequence_triggers")
    .select("id, sequence_id, config, crm_automation_sequences(is_active, allow_reentry, reentry_after_minutes, crm_automations(is_active, org_id))")
    .eq("trigger_type", "sales_meeting_reminder");

  let enrolled = 0;

  for (const trigger of triggers ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq = trigger.crm_automation_sequences as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auto = seq?.crm_automations as any;
    if (!seq?.is_active || !auto?.is_active) continue;

    const orgId = auto.org_id as string;
    const minutes = (trigger.config as { minutes?: number } | null)?.minutes;
    if (!minutes || minutes <= 0) continue;

    const windowEnd = new Date(now.getTime() + minutes * 60_000);

    const { data: meetings } = await supabase
      .from("crm_sales_meetings")
      .select("id, client_id")
      .eq("org_id", orgId)
      .eq("status", "scheduled")
      .is("deleted_at", null)
      .not("client_id", "is", null)
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", windowEnd.toISOString());

    for (const meeting of meetings ?? []) {
      const clientId = meeting.client_id as string | null;
      if (!clientId) continue;

      if (!(await triggerConditionsMet(supabase, trigger.id, clientId, null))) continue;

      // A date-gap trigger fires off a fixed anchor (scheduled_at) that never
      // changes, so without allow_reentry a prior enrollment row —
      // regardless of its status — permanently blocks re-enrollment for
      // this meeting+sequence.
      const eligible = await isEligibleForEnrollment(supabase, {
        sequenceId: trigger.sequence_id,
        clientId,
        estimateId: null,
        meetingId: meeting.id,
        allowReentry: seq.allow_reentry ?? false,
        reentryAfterMinutes: seq.reentry_after_minutes ?? 1440,
      });
      if (!eligible) continue;

      const ok = await enrollClientInSequence(supabase, {
        sequenceId: trigger.sequence_id,
        orgId,
        clientId,
        meetingId: meeting.id,
      });
      if (ok) enrolled++;
    }
  }

  return NextResponse.json({ enrolled });
}
