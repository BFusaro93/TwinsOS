import { sendClientSms } from "@/lib/sms/send";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import type { CardExpiryContext } from "./card-expiry-context";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface ResolvedSmsContent {
  toPhone: string;
  bodyText: string;
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
  const { data: client } = await supabase
    .from("clients")
    .select("display_name, primary_phone, sms_opt_in")
    .eq("id", params.clientId)
    .single();

  if (!client?.primary_phone) return { error: "client has no primary_phone" };
  if (!client.sms_opt_in) return { error: "client has not opted in to SMS" };

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", params.orgId)
    .single();

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

  const clientDisplayName = (client.display_name as string) ?? "";
  const clientFirstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const orgName = (orgRow?.name as string) ?? "Your Service Provider";

  const mergeTags: Record<string, string> = {
    "[clientfirstname]": clientFirstName,
    "[clientfullname]": clientDisplayName,
    "[companyname]": orgName,
    "[meetingdate]": meetingDate,
    "[meetingtime]": meetingTime,
    "[meetinglocation]": meetingLocation,
  };
  if (params.cardExpiryContext) {
    mergeTags["[creditcardending]"] = params.cardExpiryContext.last4;
    mergeTags["[creditcardexpiration]"] = `${params.cardExpiryContext.expMonth}/${String(params.cardExpiryContext.expYear).slice(-2)}`;
  }
  const resolve = (template: string) =>
    template.replace(/\[(\w+)\]/gi, (match) => {
      const key = match.toLowerCase();
      if (key in mergeTags) return mergeTags[key];
      // Same reasoning as sequence-email.ts's resolver: a recognized
      // Documents merge tag this narrower automation resolver doesn't know
      // how to fill in degrades to blank instead of shipping literal
      // "[tag]" text to a real client's phone.
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
