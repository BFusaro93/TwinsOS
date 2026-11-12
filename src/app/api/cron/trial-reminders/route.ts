import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createServiceClient } from "@/lib/supabase/server";
import { EMAIL_FROM, sendEmailRetryingRateLimit } from "@/lib/email/send";
import { escapeHtml } from "@/lib/utils/escape-html";
import { coerceTimeZone, daysBetweenYmd, isoInZone, todayInZone } from "@/lib/time/zone";
import { logger } from "@/lib/logger";

const log = logger.child("trial-reminders cron");

export const maxDuration = 300;

/** How long an org keeps read-only access after its trial ends (see useTrialStatus). */
const READ_ONLY_ACCESS_DAYS = 90;

type ReminderKey = "7d" | "1d";

interface TrialOrg {
  id: string;
  name: string | null;
  timezone: string | null;
  trial_ends_at: string;
  trial_reminders_sent: Record<string, string> | null;
}

/** Which reminder (if any) is due, by whole calendar days left on the org's clock (0 = last day). */
function dueReminder(daysLeft: number, sent: Record<string, string>): ReminderKey | null {
  if (daysLeft <= 1) return sent["1d"] ? null : "1d";
  // Anywhere in the last week (a missed run included) still gets the one "about a week" notice.
  if (daysLeft <= 7) return sent["7d"] || sent["1d"] ? null : "7d";
  return null;
}

function whenText(daysLeft: number, endLabel: string): string {
  if (daysLeft <= 0) return `today (${endLabel})`;
  if (daysLeft === 1) return `tomorrow (${endLabel})`;
  return `in ${daysLeft} days, on ${endLabel}`;
}

/**
 * GET /api/cron/trial-reminders — called daily by Vercel Cron.
 *
 * Emails each trial org's active admins twice before the trial ends: about a
 * week before (7 days left on the org's own calendar) and the day before (1
 * day left; or on the last day, if that run was missed). Each reminder is
 * claimed on organizations.trial_reminders_sent BEFORE sending — a re-run or
 * a parallel run can never email twice — and the claim is released again if
 * the send fails, so tomorrow's run retries it.
 *
 * Demo/sandbox orgs and the platform's own org are skipped; a trial with no
 * end date never ends, so it's never reminded.
 *
 * Security: Vercel passes Authorization: Bearer {CRON_SECRET}.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    log.warn("RESEND_API_KEY is not set — trial reminders skipped");
    return NextResponse.json({ sent: 0, skipped: "no email provider" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createServiceClient() as any;
  const now = new Date();
  // Widest window any zone can need for "7 days left": 8 days of instants ahead.
  const upper = new Date(now.getTime() + 9 * 24 * 60 * 60 * 1000).toISOString();

  const { data: orgs, error } = await db
    .from("organizations")
    .select("id, name, timezone, trial_ends_at, trial_reminders_sent")
    .eq("plan", "trial")
    .gt("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", upper)
    .not("is_demo", "is", true)
    .not("is_platform_staff_org", "is", true)
    .limit(1000);
  if (error) {
    log.error("could not load trial orgs", { error: error.message });
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";
  let sent = 0;
  let failed = 0;

  for (const org of (orgs ?? []) as TrialOrg[]) {
    const tz = coerceTimeZone(org.timezone);
    const endsAt = new Date(org.trial_ends_at);
    const lastDay = isoInZone(endsAt, tz);
    const daysLeft = daysBetweenYmd(todayInZone(tz), lastDay);
    const current = org.trial_reminders_sent ?? {};
    const key = dueReminder(daysLeft, current);
    if (!key) continue;

    const { data: admins } = await db
      .from("profiles")
      .select("email")
      .eq("org_id", org.id)
      .eq("role", "admin")
      .neq("status", "inactive");
    const recipients = [
      ...new Set(((admins ?? []) as { email: string | null }[]).map((a) => a.email?.trim()).filter((e): e is string => !!e)),
    ];
    if (recipients.length === 0) continue;

    // Claim: only succeeds if nobody else changed the sent-map since we read it.
    const claimed = { ...current, [key]: now.toISOString() };
    const { data: claimRows, error: claimErr } = await db
      .from("organizations")
      .update({ trial_reminders_sent: claimed })
      .eq("id", org.id)
      .eq("trial_reminders_sent", JSON.stringify(current))
      .select("id");
    if (claimErr) {
      log.error("could not claim trial reminder", { orgId: org.id, key, error: claimErr.message });
      failed++;
      continue;
    }
    if (!claimRows || claimRows.length === 0) continue; // another run got it

    const endLabel = endsAt.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });
    const readOnlyUntil = new Date(endsAt.getTime() + READ_ONLY_ACCESS_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString(
      "en-US",
      { timeZone: tz, month: "long", day: "numeric", year: "numeric" }
    );
    const company = escapeHtml(org.name ?? "your company");
    const when = whenText(daysLeft, endLabel);
    const subject =
      key === "1d"
        ? `Your Landscapt free trial ends ${daysLeft <= 0 ? "today" : "tomorrow"}`
        : `Your Landscapt free trial ends in ${daysLeft} days`;

    const res = await sendEmailRetryingRateLimit(resend, {
      from: EMAIL_FROM,
      to: recipients,
      subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Your free trial ends ${escapeHtml(when)}</h2>
          <p style="margin:0 0 16px;color:#475569">
            The free trial for <strong>${company}</strong> ends at the end of the day ${escapeHtml(endLabel)}.
            Subscribe before then to keep working without interruption.
          </p>
          <p style="margin:0 0 24px;color:#475569">
            If the trial ends without a subscription, your account becomes <strong>read-only</strong> until
            ${escapeHtml(readOnlyUntil)}: you can still view and export everything and email invoices you already
            sent, but nothing can be added or changed. After that the account is locked until you subscribe. Your data
            is kept either way.
          </p>
          <a
            href="${siteUrl}/settings?tab=subscription"
            style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600"
          >
            Choose a plan
          </a>
        </div>
      `,
    });

    if (res.error) {
      failed++;
      log.error("trial reminder send failed", { orgId: org.id, key, error: res.error.message });
      // Release the claim so tomorrow's run tries again.
      await db
        .from("organizations")
        .update({ trial_reminders_sent: current })
        .eq("id", org.id)
        .eq("trial_reminders_sent", JSON.stringify(claimed));
      continue;
    }
    sent++;
  }

  return NextResponse.json({ checked: orgs?.length ?? 0, sent, failed });
}
