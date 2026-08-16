import { Resend } from "resend";

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

const DEFAULT_FROM_ADDRESS = "Twins Lawn Service <noreply@twinslawnservice.com>";

/** Resolves an email step's `to`/`from` selections and [mergetag] placeholders against the client/org/estimate context. */
export async function resolveEmailStepContent(
  supabase: AnyClient,
  params: {
    orgId: string;
    clientId: string;
    estimateId: string | null;
    subjectTemplate: string;
    bodyTemplate: string;
    toSelection?: string[];
    fromSelection?: string;
  }
): Promise<ResolvedEmailContent | { error: string }> {
  const { data: client } = await supabase
    .from("clients")
    .select("display_name, primary_email, billing_email, sales_rep_id")
    .eq("id", params.clientId)
    .single();

  if (!client) return { error: "client not found" };

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

  let fromAddress = DEFAULT_FROM_ADDRESS;
  if (params.fromSelection === "sales_rep" && client.sales_rep_id) {
    const { data: rep } = await supabase
      .from("profiles")
      .select("name, email")
      .eq("id", client.sales_rep_id)
      .single();
    if (rep?.email) {
      fromAddress = rep.name ? `${rep.name} <${rep.email}>` : (rep.email as string);
    }
  }

  const { data: orgRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", params.orgId)
    .single();

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

  const clientDisplayName = (client.display_name as string) ?? "";
  const clientFirstName = clientDisplayName.split(" ")[0] ?? clientDisplayName;
  const orgName = (orgRow?.name as string) ?? "Your Service Provider";

  const mergeTags: Record<string, string> = {
    "[clientfirstname]": clientFirstName,
    "[clientfullname]": clientDisplayName,
    "[companyname]": orgName,
    "[quotenumber]": estimateNumber ?? "",
  };
  const resolve = (template: string) =>
    template.replace(/\[(\w+)\]/gi, (match) => mergeTags[match.toLowerCase()] ?? match);

  return {
    toEmails: [...toEmails],
    toName: clientDisplayName,
    fromAddress,
    subject: resolve(params.subjectTemplate || "(no subject)"),
    bodyHtml: resolve(params.bodyTemplate || ""),
  };
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

  const resend = new Resend(resendKey);
  const { data: sent, error: sendErr } = await resend.emails.send({
    from: params.fromAddress || DEFAULT_FROM_ADDRESS,
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
  const nextPos = params.completedPosition + 1;
  const nextEvent = params.events.find((e) => e.position === nextPos);

  if (!nextEvent) {
    await supabase
      .from("crm_sequence_enrollments")
      .update({ completed_at: params.nowIso, updated_at: params.nowIso })
      .eq("id", params.enrollmentId);
    return "completed";
  }

  if (nextEvent.event_type === "wait") {
    const days = (nextEvent.config as Record<string, number>)?.days ?? 0;
    const d = new Date();
    d.setDate(d.getDate() + days);
    await supabase
      .from("crm_sequence_enrollments")
      .update({ next_event_position: nextPos + 1, next_fire_at: d.toISOString(), updated_at: params.nowIso })
      .eq("id", params.enrollmentId);
    return `advanced → wait ${days}d`;
  }

  await supabase
    .from("crm_sequence_enrollments")
    .update({ next_event_position: nextPos, next_fire_at: params.nowIso, updated_at: params.nowIso })
    .eq("id", params.enrollmentId);
  return `advanced → position ${nextPos}`;
}
