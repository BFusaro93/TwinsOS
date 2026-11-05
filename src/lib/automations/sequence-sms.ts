import { sendClientSms } from "@/lib/sms/send";
import { findOptedOutNumbers, phoneLast10 } from "@/lib/sms/opt-outs";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { buildInvoiceExtras, buildServiceExtras } from "./record-merge-vars";
import { instantToZoneWallClock, shiftYmd, todayInZone, zoneWallClockToInstant } from "@/lib/time/zone";
import type { CardExpiryContext } from "./card-expiry-context";
import { buildAutomationMergeVars, loadAutomationClient } from "./client-merge-vars";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

interface ResolvedSmsContent {
  /** Recipients joined with ", " — this is what an approval row stores; sendResolvedSequenceSms splits it back. */
  toPhone: string;
  toPhones: string[];
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
    invoiceId?: string | null;
    bodyTemplate: string;
    /** The step's "Send To" selection (client_primary_phone | billing_phone | all_contacts). Defaults to the client's primary phone. */
    toSelection?: string[];
    /** Only populated for `credit_card_about_to_expire` enrollments — see fetchCardExpiryContext. */
    cardExpiryContext?: CardExpiryContext | null;
  }
): Promise<ResolvedSmsContent | { error: string }> {
  const loaded = await loadAutomationClient(supabase, { orgId: params.orgId, clientId: params.clientId });
  const client = loaded?.client;

  if (!client) return { error: "client not found" };
  // Consent to be texted is modelled at the CLIENT level (clients.sms_opt_in —
  // contacts have no SMS-consent column), and sendClientSms re-checks it at the
  // actual send. So every recipient number below (billing phone, contacts) is
  // texted under the client's own opt-in — unless that number itself replied
  // STOP, which is remembered per number (crm_sms_opt_outs, filtered below).
  if (!client.sms_opt_in) return { error: "client has not opted in to SMS" };

  const toSelection = params.toSelection?.length ? params.toSelection : ["client_primary_phone"];
  // Keyed by digits so the same number typed two ways is one recipient.
  const phonesByKey = new Map<string, string>();
  const addPhone = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const phone = raw.trim();
    const key = phone.replace(/\D/g, "");
    if (key.length >= 7 && !phonesByKey.has(key)) phonesByKey.set(key, phone);
  };
  if (toSelection.includes("client_primary_phone")) addPhone(client.primary_phone);
  if (toSelection.includes("billing_phone")) {
    // Billing phone = a number on the client typed "billing" in its phone list.
    for (const p of (client.phones ?? []) as { phone: string; type: string }[]) {
      if ((p.type ?? "").toLowerCase().includes("billing")) addPhone(p.phone);
    }
  }
  if (toSelection.includes("all_contacts")) {
    const { data: contacts } = await supabase
      .from("client_contacts")
      .select("phone, phones")
      .eq("client_id", params.clientId)
      .eq("org_id", params.orgId)
      .is("deleted_at", null);
    for (const contact of (contacts ?? []) as { phone: string | null; phones: unknown }[]) {
      const typed = Array.isArray(contact.phones) ? (contact.phones as { phone?: string }[]) : [];
      if (typed.length > 0) addPhone(typed[0]?.phone);
      else addPhone(contact.phone);
    }
  }
  if (phonesByKey.size === 0) {
    return { error: toSelection.length === 1 && toSelection[0] === "client_primary_phone"
      ? "client has no primary_phone"
      : "no resolvable phone number for the selected 'send to' options" };
  }
  // A number that texted STOP (crm_sms_opt_outs) is dropped; the client's other
  // numbers still get the step. sendClientSms re-checks at the actual send.
  const optedOut = await findOptedOutNumbers(params.orgId, Array.from(phonesByKey.values()));
  for (const [key, phone] of phonesByKey) {
    const last10 = phoneLast10(phone);
    if (last10 && optedOut.has(last10)) phonesByKey.delete(key);
  }
  if (phonesByKey.size === 0) return { error: "every recipient number has replied STOP" };

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
  Object.assign(
    extras,
    await buildInvoiceExtras(supabase, { orgId: params.orgId, invoiceId: params.invoiceId, html: false }),
    await buildServiceExtras(supabase, { orgId: params.orgId, clientId: params.clientId, today: todayInZone(await getOrgTimeZone(supabase, params.orgId)), html: false }),
  );
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

  const toPhones = [...phonesByKey.values()];
  return {
    toPhone: toPhones.join(", "),
    toPhones,
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
  // toPhone may hold several recipients joined with ", " (billing phone / all
  // contacts). Succeeds when at least one went out: retrying a partial failure
  // would text the numbers that already received it a second time.
  const phones = params.toPhone.split(",").map((p) => p.trim()).filter(Boolean);
  let firstOk: { sid: string | null } | null = null;
  let lastFail: { ok: false; reason: string; permanent?: boolean } | null = null;
  for (const phone of phones) {
    const sendResult = await sendClientSms(supabase, {
      orgId: params.orgId,
      clientId: params.clientId,
      toPhone: phone,
      body: params.bodyText,
    });
    if (sendResult.ok) firstOk = firstOk ?? { sid: sendResult.sid };
    else lastFail = sendResult;
  }
  if (firstOk) return { ok: true, sid: firstOk.sid };
  return lastFail ?? { ok: false, reason: "no phone number to text", permanent: true };
}
