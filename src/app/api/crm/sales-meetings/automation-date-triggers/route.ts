import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { isEligibleForEnrollment, enrollClientInSequence, triggerConditionsMet, logSequenceExecution } from "@/lib/automations/sequence-enrollment";
import { processEnrollmentImmediately } from "@/lib/automations/sequence-processor";

/**
 * GET  /api/crm/sales-meetings/automation-date-triggers — called every 15
 * minutes by Vercel Cron (see vercel.json). Previously driven by a GitHub
 * Actions workflow instead (Vercel Hobby caps cron at once/day); moved back
 * to native Vercel Cron after the 2026-09 upgrade to Pro.
 * POST — manual trigger for testing.
 *
 * Evaluates the 'sales_meeting_reminder' date-gap automation trigger type
 * (mirrors /api/crm/estimates/automation-date-triggers) and enrolls the
 * meeting's client into the trigger's sequence once the meeting falls within
 * that trigger's configured `minutes` lead time (60 when the builder left
 * it blank — the lead time the old reminder-cron path always used). This is
 * the ONLY enrollment path for this trigger type; /api/cron/sales-meeting-
 * reminders only notifies the rep.
 *
 * Each new enrollment is driven through its no-wait steps right away
 * (processEnrollmentImmediately) — a "15 minutes before" reminder can't wait
 * for the next /api/automations/run sweep, which would land it after the
 * meeting started. Later waits are picked up by that sweep.
 *
 * A meeting with no client (a new-lead meeting) can't be enrolled — the
 * automations engine is entirely client-scoped. The rep still gets notified
 * directly by /api/cron/sales-meeting-reminders regardless of client_id.
 */

/** Lead time for a trigger saved without a "minutes before" value. */
const DEFAULT_LEAD_MINUTES = 60;

export const maxDuration = 300;

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

  // Page through every org's triggers — a single select silently truncates
  // at 1000 rows. Ordered by id so the pages split stably.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggers: any[] = [];
  for (let from = 0; ; ) {
    const { data: page, error: trigErr } = await supabase
      .from("crm_sequence_triggers")
      .select("id, sequence_id, config, crm_automation_sequences(is_active, deleted_at, allow_reentry, reentry_after_minutes, crm_automations(is_active, deleted_at, org_id))")
      .eq("trigger_type", "sales_meeting_reminder")
      .order("id")
      .range(from, from + 999);
    if (trigErr) return NextResponse.json({ error: trigErr.message }, { status: 500 });
    if (!page || page.length === 0) break;
    triggers.push(...page);
    from += page.length;
  }

  let enrolled = 0;

  for (const trigger of triggers ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seq = trigger.crm_automation_sequences as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const auto = seq?.crm_automations as any;
    if (!seq?.is_active || !auto?.is_active || seq.deleted_at || auto.deleted_at) continue;

    const orgId = auto.org_id as string;
    const configured = Number((trigger.config as { minutes?: number } | null)?.minutes);
    const minutes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LEAD_MINUTES;

    const windowEnd = new Date(now.getTime() + minutes * 60_000);

    const { data: meetings } = await supabase
      .from("crm_sales_meetings")
      .select("id, client_id, scheduled_at")
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
      let eligible = await isEligibleForEnrollment(supabase, {
        sequenceId: trigger.sequence_id,
        clientId,
        estimateId: null,
        meetingId: meeting.id,
        allowReentry: seq.allow_reentry ?? false,
        reentryAfterMinutes: seq.reentry_after_minutes ?? 1440,
      });
      // A rescheduled meeting is a new occurrence: dedupe is keyed on
      // meeting_id, so without this the reminder never re-fires for the new
      // time. Each enrollment logs the scheduled_at it was created for; if the
      // latest FINISHED enrollment recorded a different time, re-enroll.
      // (Enrollments with no recorded time — pre-dating this — keep the old
      // behavior. In-flight enrollments are never duplicated.)
      if (!eligible && (await meetingRescheduledSinceEnrollment(supabase, trigger.sequence_id, meeting.id, meeting.scheduled_at as string))) {
        eligible = true;
      }
      if (!eligible) continue;

      const enrollmentId = await enrollClientInSequence(supabase, {
        sequenceId: trigger.sequence_id,
        orgId,
        clientId,
        meetingId: meeting.id,
      });
      if (enrollmentId) {
        enrolled++;
        await logSequenceExecution(supabase, {
          orgId, enrollmentId, sequenceId: trigger.sequence_id, clientId,
          action: "meeting_scheduled_at", detail: new Date(meeting.scheduled_at as string).toISOString(),
        });
        await processEnrollmentImmediately(supabase, enrollmentId);
      }
    }
  }

  return NextResponse.json({ enrolled });
}

/**
 * True when the most recent enrollment for (sequence, meeting) has FINISHED
 * (completed/stopped) and was created for a different scheduled_at than the
 * meeting has now. Returns false when it can't tell.
 */
async function meetingRescheduledSinceEnrollment(
  supabase: AdminClient,
  sequenceId: string,
  meetingId: string,
  scheduledAt: string
): Promise<boolean> {
  const { data: latest } = await supabase
    .from("crm_sequence_enrollments")
    .select("id, completed_at, stopped_at")
    .eq("sequence_id", sequenceId)
    .eq("meeting_id", meetingId)
    .is("deleted_at", null)
    .order("enrolled_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest || (!latest.completed_at && !latest.stopped_at)) return false;
  const { data: logRow } = await supabase
    .from("crm_sequence_execution_log")
    .select("detail")
    .eq("enrollment_id", latest.id)
    .eq("action", "meeting_scheduled_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!logRow?.detail) return false;
  return new Date(logRow.detail as string).getTime() !== new Date(scheduledAt).getTime();
}
