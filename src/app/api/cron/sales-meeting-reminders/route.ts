import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { EMAIL_FROM } from "@/lib/email/send";
import { getOrgTimeZone } from "@/lib/time/org-timezone";

/**
 * GET /api/cron/sales-meeting-reminders — called every 15 minutes by Vercel
 * Cron (see vercel.json). Previously driven by a GitHub Actions workflow
 * instead, because Vercel's Hobby plan caps cron at once/day regardless of
 * schedule string (see report-schedules for the same history); moved back
 * to native Vercel Cron after the 2026-09 upgrade to Pro.
 *
 * Two independent things happen here, same split as contract-expiry-notify:
 *  1. The meeting's sales rep gets a direct in-app + email reminder — this
 *     always fires (fixed REMINDER_LEAD_MINUTES window), not gated behind
 *     any automation being configured, since a rep should always know their
 *     day is coming up regardless of what an admin has set up.
 *  2. Client-facing automation reminders are NOT fired from here any more.
 *     This route used to also call fireSimpleTrigger("sales_meeting_reminder")
 *     for every meeting entering its fixed 60-minute window, which ignored
 *     each trigger's configured "minutes before": a 30-minute reminder went
 *     out at T-60, and a sequence configured for a day ahead could be
 *     enrolled a second time at T-60 when re-entry was allowed.
 *     /api/crm/sales-meetings/automation-date-triggers (same 15-min cadence)
 *     is the single enrollment path and honors the configured lead time.
 *
 * `reminder_sent_at` dedupes rep notifications across runs (15-min cadence
 * would otherwise re-notify on every tick within the window).
 *
 * Security: the calling workflow passes Authorization: Bearer {CRON_SECRET}.
 */

const REMINDER_LEAD_MINUTES = 60;

const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60_000);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: upcoming } = await (supabase as any)
    .from("crm_sales_meetings")
    .select(`
      id, org_id, title, scheduled_at, location, client_id, lead_name,
      sales_rep_id,
      clients(display_name),
      crm_employees(id, user_id, email, first_name, last_name)
    `)
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .is("reminder_sent_at", null)
    .gte("scheduled_at", now.toISOString())
    .lte("scheduled_at", windowEnd.toISOString());

  if (!upcoming?.length) {
    return NextResponse.json({ notified: 0 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  let notified = 0;

  for (const meeting of upcoming as Record<string, unknown>[]) {
    // Claim this meeting before sending anything — conditioned on
    // reminder_sent_at still being null, so an overlapping/retried cron run
    // (this fires every 15 min and isn't guaranteed exactly-once) can't also
    // pick it up and send a duplicate reminder. Same pattern as the campaign
    // send cron's claim-before-send guard.
    const { data: claimed } = await supabase
      .from("crm_sales_meetings")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", meeting.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const rep = meeting.crm_employees as Record<string, unknown> | null;
    const clientName = (meeting.clients as Record<string, unknown> | null)?.display_name as string
      ?? (meeting.lead_name as string | null)
      ?? "a new lead";
    const scheduledAt = new Date(meeting.scheduled_at as string);
    // The Node runtime's default timezone is UTC on Vercel — without an
    // explicit timeZone this would show a 2pm meeting as "6pm" (or "7pm"
    // outside DST) in both the in-app notification and the reminder email.
    // The meeting was booked on its own org's clock, so that is the clock it
    // has to be read back on.
    const meetingTz = await getOrgTimeZone(supabase, meeting.org_id as string);
    const timeStr = scheduledAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: meetingTz,
    });
    // `?open=` makes the calendar jump to the meeting's day and open it —
    // without it the link only landed on whatever day the calendar defaults
    // to, which is the wrong one for anything scheduled just after midnight.
    const meetingUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com"}/crm/sales-meetings?open=${meeting.id as string}`;

    if (rep) {
      // crm_employees has no notification_prefs of its own — that lives on
      // profiles, keyed by the employee's linked login (user_id), which has
      // no declared FK relationship PostgREST can nest-select through, so
      // it's looked up separately. An employee with no user_id (no login)
      // still gets the email via crm_employees.email, just no in-app row.
      let prefs: Record<string, unknown> = {};
      if (rep.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("notification_prefs")
          .eq("id", rep.user_id)
          .single();
        prefs = (profile?.notification_prefs ?? {}) as Record<string, unknown>;
      }
      const repName = `${rep.first_name} ${rep.last_name}`.trim();

      if (rep.user_id && prefs.inAppMeetingReminder !== false) {
        await supabase
          .from("notifications")
          .insert({
            org_id: meeting.org_id,
            user_id: rep.user_id,
            type: "sales_meeting_reminder",
            title: `Meeting at ${timeStr} — ${clientName}`,
            message: `${meeting.title} with ${clientName} starts at ${timeStr}${meeting.location ? ` at ${meeting.location}` : ""}.`,
            entity_id: meeting.id,
            entity_type: "sales_meeting",
          });
      }

      if (rep.email && prefs.emailMeetingReminder !== false) {
        try {
          await resend.emails.send({
            from: EMAIL_FROM,
            to: rep.email as string,
            subject: `Meeting in ${REMINDER_LEAD_MINUTES} minutes — ${clientName}`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
              <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Upcoming Sales Meeting</h2>
              <p style="margin:0 0 4px;color:#475569">Hi ${repName || "there"},</p>
              <p style="margin:0 0 24px;color:#475569"><strong>${meeting.title}</strong> with ${clientName} starts at <strong>${timeStr}</strong>${meeting.location ? ` at ${meeting.location}` : ""}.</p>
              <a href="${meetingUrl}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">View Calendar</a>
            </div>`,
          });
          notified++;
        } catch {
          // continue to next meeting if one email fails
        }
      }
    }
  }

  return NextResponse.json({ notified });
}
