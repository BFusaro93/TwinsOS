import "server-only";
import { Resend } from "resend";
import { EMAIL_FROM, escapeHtml, sendEmailRetryingRateLimit } from "@/lib/email/send";

// Emails Landscapt support staff (members of the platform staff org —
// organizations.is_platform_staff_org) when a customer org sends feedback or
// opens / continues a support chat, so neither sits unread in /internal until
// someone happens to look. Email only: staff already see both live in
// /internal/feedback and /internal/chat.

const SITE_URL = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://landscapt.com";

async function resolveStaffRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ email: string; name: string | null }[]> {
  const { data: staffOrgs } = await supabase.from("organizations").select("id").eq("is_platform_staff_org", true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgIds = (staffOrgs ?? []).map((o: any) => o.id as string);
  if (!orgIds.length) return [];
  const { data: staff } = await supabase
    .from("profiles")
    .select("email, name")
    .in("org_id", orgIds)
    .neq("status", "inactive")
    .not("email", "is", null);
  return staff ?? [];
}

async function emailStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { subject: string; heading: string; lines: string[]; quote: string; buttonLabel: string; path: string }
): Promise<number> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return 0;
  const recipients = await resolveStaffRecipients(supabase);
  if (!recipients.length) return 0;

  const resend = new Resend(resendKey);
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
    <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">${escapeHtml(opts.heading)}</h2>
    ${opts.lines.map((l) => `<p style="margin:0 0 4px;color:#475569">${escapeHtml(l)}</p>`).join("")}
    <blockquote style="margin:16px 0 24px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#374151;white-space:pre-wrap">${escapeHtml(opts.quote)}</blockquote>
    <a href="${SITE_URL()}${opts.path}" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${escapeHtml(opts.buttonLabel)}</a>
  </div>`;

  let sent = 0;
  for (const r of recipients) {
    await sendEmailRetryingRateLimit(resend, { from: EMAIL_FROM, to: r.email, subject: opts.subject.replace(/\s+/g, " ").trim(), html })
      // A rejected send resolves with `error` rather than throwing, so count
      // only a send that actually went out (a "0 sent" run is retried by the
      // support-chat cron).
      .then((res) => { if (!res.error) sent++; })
      .catch(() => {
        // Non-fatal — one recipient failing shouldn't block the others
      });
  }
  return sent;
}

function snippet(text: string, max = 600): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function notifyStaffOfFeedback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  fb: { category: string; message: string; pageUrl: string | null; hasScreenshot: boolean; orgName: string; submitter: string }
): Promise<number> {
  const label = fb.category === "bug" ? "Bug" : fb.category === "idea" ? "Idea" : "Feedback";
  return emailStaff(supabase, {
    subject: `New ${label.toLowerCase()} from ${fb.orgName}`,
    heading: `New ${label.toLowerCase()} from ${fb.orgName}`,
    lines: [
      `From: ${fb.submitter}`,
      ...(fb.pageUrl ? [`Page: ${fb.pageUrl}`] : []),
      ...(fb.hasScreenshot ? ["A screenshot is attached — open it in the inbox."] : []),
    ],
    quote: snippet(fb.message),
    buttonLabel: "Open feedback inbox",
    path: "/internal/feedback",
  });
}

export async function notifyStaffOfSupportMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  msg: { orgName: string; senderName: string; body: string; newConversation: boolean }
): Promise<number> {
  return emailStaff(supabase, {
    subject: msg.newConversation
      ? `New support chat from ${msg.orgName}`
      : `New message from ${msg.orgName} in support chat`,
    heading: msg.newConversation ? `${msg.orgName} started a support chat` : `${msg.orgName} sent a new message`,
    lines: [`From: ${msg.senderName}`],
    quote: snippet(msg.body),
    buttonLabel: "Open support chat",
    path: "/internal/chat",
  });
}

// Shared inbox that gets Ask AI items needing a human reply, in addition to
// the per-staff emails above. Override with SUPPORT_INBOX_EMAIL.
const SUPPORT_INBOX = () => process.env.SUPPORT_INBOX_EMAIL ?? "support@landscapt.com";

/**
 * Emails the support inbox about an Ask AI item that needs a human: a
 * question the help docs didn't cover or only partly answered, or a
 * conversation the customer sent to support (the only email an escalation
 * produces). Best-effort; returns whether it was sent.
 */
export async function notifySupportInboxOfAskAI(item: {
  kind: "not-covered" | "partial" | "escalated";
  orgName: string;
  asker: string;
  question: string;
  answer?: string | null;
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const escalated = item.kind === "escalated";
  const heading = escalated
    ? `${item.orgName} sent an Ask AI conversation to support`
    : item.kind === "partial"
      ? `Ask AI only partly answered a question from ${item.orgName}`
      : `Ask AI couldn't answer a question from ${item.orgName}`;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
    <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">${escapeHtml(heading)}</h2>
    <p style="margin:0 0 4px;color:#475569">From: ${escapeHtml(item.asker)}</p>
    <p style="margin:0 0 4px;color:#475569">${escalated ? "The customer is waiting on a reply." : "No one has been contacted — write the answer once and Ask AI will reuse it."}</p>
    <blockquote style="margin:16px 0 8px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#374151;white-space:pre-wrap">${escapeHtml(snippet(item.question))}</blockquote>
    ${item.answer ? `<p style="margin:0 0 4px;color:#94a3b8;font-size:12px">Ask AI replied:</p><blockquote style="margin:0 0 24px;padding:12px 16px;background:#f8fafc;border-left:4px solid #e2e8f0;border-radius:4px;color:#64748b;white-space:pre-wrap">${escapeHtml(snippet(item.answer, 400))}</blockquote>` : '<div style="height:16px"></div>'}
    <a href="${SITE_URL()}/internal/ask-ai" style="display:inline-block;padding:12px 24px;background:#60ab45;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open Ask AI review</a>
  </div>`;

  return new Resend(resendKey).emails
    .send({
      from: EMAIL_FROM,
      to: SUPPORT_INBOX(),
      subject: escalated
        ? `Ask AI conversation from ${item.orgName}`
        // A multi-line question (the box is a textarea) put raw newlines in the
        // subject header, which the mail API rejects — the gap email was dropped.
        : `${item.kind === "partial" ? "Ask AI partial answer" : "Ask AI gap"}: ${snippet(item.question, 70).replace(/\s+/g, " ")}`,
      html,
    })
    .then(() => true)
    .catch(() => false);
}

/**
 * Emails the support inbox when someone starts a free trial, with the contact
 * details they typed on the signup form. The email address is unverified at
 * this point (the account isn't confirmed yet), so the email says so.
 * Best-effort; returns whether it was sent.
 */
export async function notifySupportInboxOfTrialSignup(signup: {
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  plan: string | null;
}): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const row = (label: string, value: string | null) =>
    `<p style="margin:0 0 4px;color:#475569"><strong>${label}:</strong> ${value ? escapeHtml(value) : "—"}</p>`;
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
    <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a">New trial signup: ${escapeHtml(signup.companyName)}</h2>
    ${row("Company", signup.companyName)}
    ${row("Contact", signup.contactName)}
    ${row("Email", signup.contactEmail)}
    ${row("Phone", signup.contactPhone)}
    ${row("Plan chosen", signup.plan)}
    <p style="margin:12px 0 0;color:#94a3b8;font-size:12px">Sent when the signup form is submitted, before the email address is confirmed.</p>
  </div>`;

  return new Resend(resendKey).emails
    .send({
      from: EMAIL_FROM,
      to: SUPPORT_INBOX(),
      ...(signup.contactEmail ? { replyTo: signup.contactEmail } : {}),
      subject: `New trial signup: ${signup.companyName}`,
      html,
    })
    .then(() => true)
    .catch(() => false);
}
