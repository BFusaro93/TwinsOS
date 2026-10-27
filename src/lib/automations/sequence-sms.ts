import { sendClientSms } from "@/lib/sms/send";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { instantToZoneWallClock, shiftYmd, zoneWallClockToInstant } from "@/lib/time/zone";
import type { CardExpiryContext } from "./card-expiry-context";
import { buildAutomationMergeVars, loadAutomationClient } from "./client-merge-vars";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface ResolvedSmsContent {
  toPhone: string;
  bodyText: string;
}

/**
 * TCPA quiet hours for automated texts: nothing before 8am or from 9pm. The
 * client's own zone isn't stored, so the org's zone is used (service area is
 * roughly the org's zone). Returns null when sending is allowed right now, or
 * the next 8:00 AM org-time instant when it is not. Shared by the processor
 * (before queuing/sending) and the approval route (so approving at night
 * defers instead of texting immediately).
 */
export async function nextSmsSendTime(
  supabase: AnyClient,
  orgId: string,
  now: Date = new Date()
): Promise<{ tz: string; sendAt: Date } | null> {
  const tz = await getOrgTimeZone(supabase, orgId);
  const wall = instantToZoneWallClock(now, tz);
  const hour = Number(wall.time.slice(0, 2));
  if (hour >= 8 && hour < 21) return null;
  const sendDate = hour < 8 ? wall.date : shiftYmd(wall.date, 1);
  const sendAt = zoneWallClockToInstant(sendDate, "08:00", tz) ?? new Date(now.getTime() + 3_600_000);
  return { tz, sendAt };
}

/** Resolves a text-message step's [mergetag] placeholders against the client/org context. */
export async function resolveSmsStepContent(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string;
    meetingId?: string | null;
    bodyTemplate: string;
    /** Only populated for `credit_card_about_to_expire` enrollments — see fetchCardExpiryContext. */
    cardExpiryContext?: CardExpiryContext | null;
  }
): Promise<ResolvedSmsContent | { error: string }> {
  const loaded = await loadAutomationClient(supabase, { orgId: params.orgId, clientId: params.clientId });
  const client = loaded?.client;

  if (!client?.primary_phone) return { error: "client has no primary_phone" };
  if (!client.sms_opt_in) return { error: "client has not opted in to SMS" };

  let meetingDate = "";
  let meetingTime = "";
  let meetingLocation = "";
  if (params.meetingId) {
    const { data: meeting } = await supabase
      .from("crm_sales_meetings")
      .select("scheduled_at, location")
      .eq("id", params.meetingId)
      .single();
    if (meeting) {
      const when = new Date(meeting.scheduled_at as string);
      // scheduled_at is a timestamptz, and the Node runtime's default zone is
      // UTC on Vercel — without an explicit timeZone a 2pm meeting goes out to
      // the customer as "6pm" (7pm outside DST), and an evening meeting shows
      // tomorrow's date. The meeting was booked on its org's clock, so that is
      // the clock it has to be read back on. Same rule as the reminder cron in
      // api/cron/sales-meeting-reminders.
      const meetingTz = await getOrgTimeZone(supabase, params.orgId);
      meetingDate = when.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: meetingTz });
      meetingTime = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: meetingTz });
      meetingLocation = (meeting.location as string | null) ?? "";
    }
  }

  // Same shared vocabulary as emails; SMS is plain text so raw (unescaped) values.
  const extras: Record<string, string> = {
    "[meetingdate]": meetingDate,
    "[meetingtime]": meetingTime,
    "[meetinglocation]": meetingLocation,
  };
  if (params.cardExpiryContext) {
    extras["[creditcardending]"] = params.cardExpiryContext.last4;
    extras["[creditcardexpiration]"] = `${params.cardExpiryContext.expMonth}/${String(params.cardExpiryContext.expYear).slice(-2)}`;
  }
  const vars = await buildAutomationMergeVars(supabase, {
    orgId: params.orgId, client, extras, escapeHtml: (t) => t,
  });
  const resolve = (template: string) =>
    template.replace(/\[(\w+)\]/gi, (match) => {
      const key = match.toLowerCase();
      if (key in vars.text) return vars.text[key] ?? "";
      // Recognized Documents tag we can't fill degrades to blank, not literal "[tag]".
      return KNOWN_MERGE_TAG_KEYS.has(key) ? "" : match;
    });

  return {
    toPhone: client.primary_phone as string,
    bodyText: resolve(params.bodyTemplate || ""),
  };
}

/**
 * Sends fully-resolved SMS content via Twilio and logs it to the client's
 * activity timeline — the text-message analog of sendResolvedSequenceEmail.
 */
export async function sendResolvedSequenceSms(
  supabase: AnyClient,
  params: { orgId: string; clientId: string | null; toPhone: string; bodyText: string }
): Promise<{ ok: true; sid: string | null } | { ok: false; reason: string; permanent?: boolean }> {
  const sendResult = await sendClientSms(supabase, {
    orgId: params.orgId,
    clientId: params.clientId,
    toPhone: params.toPhone,
    body: params.bodyText,
  });
  if (!sendResult.ok) return sendResult;
  return { ok: true, sid: sendResult.sid };
}
