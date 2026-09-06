import { Resend } from "resend";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";
import { orgEmailFrom } from "@/lib/email/send";
import { computeWaitFireAt } from "./sequence-enrollment";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export interface SequenceEventRow {
  id: string;
  event_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: Record<string, any>;
  position: number;
}

interface ResolvedEmailContent {
  toEmails: string[];
  toName: string;
  fromAddress: string;
  subject: string;
  bodyHtml: string;
}


/** Resolves an email step's `to`/`from` selections and [mergetag] placeholders against the client/org/estimate context. */
export async function resolveEmailStepContent(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string;
    estimateId: string | null;
    meetingId?: string | null;
    subjectTemplate: string;
    bodyTemplate: string;
    toSelection?: string[];
    fromSelection?: string;
  }
): Promise<ResolvedEmailContent | { error: string }> {
  const { data: client } = await supabase
    .from("clients")
    .select("display_name, primary_email, billing_email, primary_phone, billing_address, billing_city, billing_state, billing_zip, account_number, sales_rep_id, do_not_market")
    .eq("id", params.clientId)
    .single();

  if (!client) return { error: "client not found" };
  // Same opt-out flag Sales Campaigns checks before sending — a client who
  // used the unsubscribe link should stop getting automation emails too,
  // not just campaign blasts.
  if (client.do_not_market) return { error: "client has opted out of marketing emails (do_not_market)" };

  const toSelection = params.toSelection?.length ? params.toSelection : ["client_primary"];
  const toEmails = new Set<string>();

  if (toSelection.includes("client_primary") && client.primary_email) {
    toEmails.add(client.primary_email as string);
  }
  if (toSelection.includes("billing_email") && client.billing_email) {
    toEmails.add(client.billing_email as string);
  }
  if (toSelection.includes("all_contacts")) {
    const { data: contacts } = await supabase
      .from("client_contacts")
      .select("email")
      .eq("client_id", params.clientId)
      .eq("ok_to_email", true)
      .is("deleted_at", null);
    for (const contact of contacts ?? []) {
      if (contact.email) toEmails.add(contact.email as string);
    }
  }

  if (toEmails.size === 0) return { error: "no resolvable recipient email for the selected 'to' options" };

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", params.orgId)
    .single();

  // Default sender is the tenant's own name on the shared verified domain —
  // never a hard-coded tenant.
  let fromAddress = orgEmailFrom(orgRow?.name as string | null | undefined);
  if (params.fromSelection === "sales_rep" && client.sales_rep_id) {
    // clients.sales_rep_id references crm_employees, not profiles — an
    // employee's email/name live there directly regardless of whether they
    // have a login (profiles row) at all.
    const { data: rep } = await supabase
      .from("crm_employees")
      .select("first_name, last_name, email")
      .eq("id", client.sales_rep_id)
      .single();
    if (rep?.email) {
      const repName = `${rep.first_name ?? ""} ${rep.last_name ?? ""}`.trim();
      fromAddress = repName ? `${repName} <${rep.email}>` : (rep.email as string);
    }
  }

  let estimateNumber: string | null = null;
  if (params.estimateId) {
    const { data: estRow } = await supabase
      .from("estimates")
      .select("estimate_number")
      .eq("id", params.estimateId)
      .single();
    if (estRow?.estimate_number != null) {
      estimateNumber = String(estRow.estimate_number).padStart(5, "0");
    }
  }

  let meetingDate = "";
  let meetingTime = "";
  let meetingLocation = "";
  let meetingTitle = "";
  let salesRepName = "";
  if (params.meetingId) {
    const { data: meeting } = await supabase
      .from("crm_sales_meetings")
      .select("title, scheduled_at, location, crm_employees(first_name, last_name)")
      .eq("id", params.meetingId)
      .single();
    if (meeting) {
      const when = new Date(meeting.scheduled_at as string);
      meetingDate = when.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
      meetingTime = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      meetingLocation = (meeting.location as string | null) ?? "";
      meetingTitle = (meeting.title as string) ?? "";
      const rep = meeting.crm_employees as { first_name: string; last_name: string } | null;
      salesRepName = rep ? `${rep.first_name} ${rep.last_name}`.trim() : "";
    }
  }

  const clientDisplayName = (client.display_name as string) ?? "";
  const clientFirstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const orgName = (orgRow?.name as string) ?? "Your Service Provider";

  const mergeTags: Record<string, string> = {
    "[clientfirstname]": clientFirstName,
    "[clientfullname]": clientDisplayName,
    "[companyname]": orgName,
    "[quotenumber]": estimateNumber ?? "",
    "[clientemail]": (client.primary_email as string | null) ?? (client.billing_email as string | null) ?? "",
    "[clientcellphone]": (client.primary_phone as string | null) ?? "",
    "[clienthomephone]": (client.primary_phone as string | null) ?? "",
    "[billingaddress1]": (client.billing_address as string | null) ?? "",
    "[billingcity]": (client.billing_city as string | null) ?? "",
    "[billingstate]": (client.billing_state as string | null) ?? "",
    "[billingzip]": (client.billing_zip as string | null) ?? "",
    "[accountnumber]": (client.account_number as string | null) ?? "",
    "[meetingdate]": meetingDate,
    "[meetingtime]": meetingTime,
    "[meetinglocation]": meetingLocation,
    "[meetingtitle]": meetingTitle,
    "[salesrepname]": salesRepName,
  };
  const resolve = (template: string) =>
    template.replace(/\[(\w+)\]/gi, (match) => {
      const key = match.toLowerCase();
      if (key in mergeTags) return mergeTags[key];
      // Same reasoning as the shared resolveMergeTags helper: a recognized
      // Documents tag this narrower automation resolver doesn't know how to
      // fill in degrades to blank instead of shipping literal "[tag]" text
      // to a real client — this step's body/subject can come from a
      // Documents template built with the full ~40-tag picker.
      return KNOWN_MERGE_TAG_KEYS.has(key) ? "" : match;
    });

  return {
    toEmails: [...toEmails],
    toName: clientDisplayName,
    fromAddress,
    subject: resolve(params.subjectTemplate || "(no subject)"),
    bodyHtml: plainTextToHtml(resolve(params.bodyTemplate || "")),
  };
}

/** The automation email step's body field is a plain `<textarea>` (no rich
 *  text), unlike every other send path in the app (invoices, estimates,
 *  form notifications) which already convert blank-line-separated text into
 *  paragraphs before sending as HTML. Without this, a hand-typed multi-
 *  paragraph email arrived as one run-on paragraph — blank lines and single
 *  line breaks both collapse in HTML unless converted. Left alone if the
 *  text already contains markup (defensive, in case a legacy body was HTML). */
function plainTextToHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 12px 0">${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Sends fully-resolved email content via Resend, logs it to the client's
 * activity timeline (same as every other client-facing send in the app), and
 * — for estimate-linked sends — also logs it to estimate_emails.
 */
export async function sendResolvedSequenceEmail(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string | null;
    estimateId: string | null;
    toEmails: string[];
    toName: string | null;
    fromAddress?: string;
    subject: string;
    bodyHtml: string;
  }
): Promise<{ ok: true; resendId: string | null } | { ok: false; reason: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, reason: "RESEND_API_KEY not configured" };

  let fromAddress = params.fromAddress;
  if (!fromAddress) {
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", params.orgId)
      .single();
    fromAddress = orgEmailFrom(orgRow?.name as string | null | undefined);
  }

  const resend = new Resend(resendKey);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: fromAddress,
    to: params.toEmails,
    subject: params.subject,
    html: params.bodyHtml,
  });
  if (sendErr) return { ok: false, reason: `email send failed: ${String(sendErr)}` };

  const toEmailsJoined = params.toEmails.join(", ");

  if (params.clientId) {
    await supabase.from("client_activity").insert({
      org_id: params.orgId,
      client_id: params.clientId,
      activity_type: "email",
      subject: params.subject,
      body: `Sent to ${toEmailsJoined} (automation)`,
      sent_to: toEmailsJoined,
      resend_message_id: sent?.id ?? null,
      occurred_at: new Date().toISOString(),
    });
  }

  if (params.estimateId) {
    await supabase.from("estimate_emails").insert({
      org_id: params.orgId,
      estimate_id: params.estimateId,
      to_email: toEmailsJoined,
      to_name: params.toName || null,
      subject: params.subject,
      body_html: params.bodyHtml,
      resend_id: sent?.id ?? null,
      email_type: "automation",
    });
  }

  return { ok: true, resendId: sent?.id ?? null };
}

/**
 * Advances an enrollment past the step at `completedPosition` — completes the
 * enrollment if nothing follows, chains through an immediately-following
 * `wait` event's delay, or otherwise just steps to the next position. Shared
 * by every step type that finishes and needs to move the enrollment on
 * (email send, alert dispatch, an approved step, etc).
 */
export async function advanceEnrollmentPastStep(
  supabase: AnyClient,
  params: { enrollmentId: string; events: SequenceEventRow[]; completedPosition: number; nowIso: string }
): Promise<string> {
  // `params.events` is pre-filtered to is_active events, so a deactivated
  // middle step leaves a gap at completedPosition + 1 — matching that exact
  // position would read "nothing follows" and complete the enrollment early.
  // Take the next active step by position instead, wherever it actually is.
  const nextEvent = params.events
    .filter((e) => e.position > params.completedPosition)
    .sort((a, b) => a.position - b.position)[0];

  if (!nextEvent) {
    await supabase
      .from("crm_sequence_enrollments")
      .update({ completed_at: params.nowIso, updated_at: params.nowIso })
      .eq("id", params.enrollmentId);
    return "completed";
  }

  if (nextEvent.event_type === "wait") {
    const waitConfig = (nextEvent.config as Record<string, number>) ?? {};
    const days = waitConfig.days ?? 0;
    const hours = waitConfig.hours ?? 0;
    const minutes = waitConfig.minutes ?? 0;
    const d = computeWaitFireAt(waitConfig);
    await supabase
      .from("crm_sequence_enrollments")
      .update({ next_event_position: nextEvent.position + 1, next_fire_at: d.toISOString(), updated_at: params.nowIso })
      .eq("id", params.enrollmentId);
    return `advanced → wait ${days}d ${hours}h ${minutes}m`;
  }

  await supabase
    .from("crm_sequence_enrollments")
    .update({ next_event_position: nextEvent.position, next_fire_at: params.nowIso, updated_at: params.nowIso })
    .eq("id", params.enrollmentId);
  return `advanced → position ${nextEvent.position}`;
}
