import { Resend } from "resend";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";

export const EMAIL_FROM = "Landscapt <noreply@landscapt.com>";
/** Same mailbox/domain as EMAIL_FROM — only the display name differs, for CMMS/Equipt-triggered notifications (work orders, maintenance requests, PO/requisitions). */
export const EMAIL_FROM_EQUIPT = "Equipt <noreply@landscapt.com>";

/** The bare mailbox behind EMAIL_FROM ("noreply@landscapt.com"). */
export const EMAIL_FROM_ADDRESS = EMAIL_FROM.match(/<([^>]+)>/)?.[1] ?? EMAIL_FROM;

/**
 * Sender for org-branded, client-facing emails (estimates, invoices, proposal
 * confirmations): the tenant's own display name as the friendly part, on the
 * shared verified sending domain — never a hard-coded tenant's name. Falls
 * back to EMAIL_FROM when the org has no usable name.
 */
export function orgEmailFrom(orgName: string | null | undefined): string {
  // RFC 5322 display-name: drop characters that would break or escape the
  // header (quotes, angle brackets, newlines) rather than trying to quote them.
  const friendly = (orgName ?? "").replace(/["<>\r\n]/g, "").trim();
  return friendly ? `${friendly} <${EMAIL_FROM_ADDRESS}>` : EMAIL_FROM;
}

/**
 * Escapes text for safe interpolation into HTML markup. Merge-tag values
 * here originate from freeform fields (client display name, org name/phone)
 * that staff — or in some flows an external submitter — control; without
 * this, a name containing `<`/`&`/quotes breaks the HTML or, worse, injects
 * markup/script into an email actually delivered to a real recipient (same
 * class of bug fixed for form-submission notification emails).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Replaces `[token]` placeholders (case-insensitive) with resolved values. */
export function resolveMergeTags(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    if (key in vars) return vars[key];
    // A recognized merge-tag name (from the same catalog the Documents tag
    // picker offers) this call didn't resolve a value for — blank it out
    // rather than shipping literal "[tag]" text to a real recipient.
    // Anything else is left alone (likely genuine bracket text typed by
    // the author, not an unresolved placeholder).
    return KNOWN_MERGE_TAG_KEYS.has(key) ? "" : match;
  });
}

// ── Resend error → HTTP response mapping ──────────────────────────────────────

// Resend's error `name` codes → what we tell the client. Recipient/content
// problems are the sender's to fix (4xx, with the provider's own message —
// e.g. a rejected @example.com address); quota problems are "try again later"
// (429); everything else is a provider-side or configuration problem (502,
// generic copy — full details belong in the server log, not the toast).
const RESEND_RECIPIENT_ERROR_CODES = new Set([
  "validation_error",
  "missing_required_field",
  "invalid_parameter",
  "invalid_attachment",
]);
const RESEND_QUOTA_ERROR_CODES = new Set([
  "rate_limit_exceeded",
  "daily_quota_exceeded",
  "monthly_quota_exceeded",
]);

/**
 * Maps a failed `resend.emails.send()` error to an HTTP status + user-facing
 * message. `subject` names what wasn't sent ("the invoice", "the estimate")
 * for the generic 502 copy. Shared by every route that sends through Resend so
 * an undeliverable address never surfaces as a bare 500 / "Failed to send".
 */
export function mapSendError(
  err: { name?: string; message?: string },
  subject = "the email",
): { status: number; error: string } {
  const code = err.name ?? "";
  if (RESEND_RECIPIENT_ERROR_CODES.has(code)) {
    return {
      status: 422,
      error: `Email provider rejected the message: ${err.message ?? "invalid recipient or content"}`,
    };
  }
  if (RESEND_QUOTA_ERROR_CODES.has(code)) {
    return { status: 429, error: "Email sending limit reached — please try again shortly." };
  }
  return { status: 502, error: `Email provider error — ${subject} was not sent. Please try again.` };
}

interface ClientForMergeVars {
  displayName: string | null;
  balanceOutstandingCents?: number | null;
}

interface OrgForMergeVars {
  name: string | null;
  addressPhone?: string | null;
}

/**
 * Shared merge vars available to any client-facing email (individual or bulk).
 *
 * Pass `{ escape: false }` when the resolved output is going somewhere that
 * is never rendered as HTML (e.g. a plain-text email `subject` line) — HTML-
 * escaping there is not just unnecessary, it's wrong: it leaks literal
 * `&amp;`/`&#39;` etc. into text the recipient reads verbatim. Defaults to
 * `true` (escaped) because the common case is substituting into an HTML body.
 */
export function buildClientMergeVars(
  client: ClientForMergeVars,
  org: OrgForMergeVars,
  opts: { escape?: boolean } = {}
): Record<string, string> {
  const shouldEscape = opts.escape ?? true;
  const esc = shouldEscape ? escapeHtml : (text: string) => text;

  // Compute names/split from the raw value, then escape only at the point
  // of exposure below — escaping first would corrupt the split (e.g. an
  // embedded "&" becoming "&amp;" before the space-split runs).
  const rawDisplayName = client.displayName ?? "";
  const rawFirstName = rawDisplayName.split(" ")[0] ?? rawDisplayName;
  const rawLastName = rawDisplayName.split(" ").slice(1).join(" ");
  const balance = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((client.balanceOutstandingCents ?? 0) / 100);

  const displayName = esc(rawDisplayName);
  const firstName = esc(rawFirstName);
  const lastName = esc(rawLastName);
  const companyName = esc(org.name ?? "Your Service Provider");
  const companyPhone = esc(org.addressPhone ?? "");

  return {
    "[clientfirstname]": firstName,
    "[clientlastname]": lastName,
    "[clientfullname]": displayName,
    "[companyname]": companyName,
    "[companyphonenumber]": companyPhone,
    "[accountbalance]": balance,
    // Aliases for the Documents module's merge-tag vocabulary (src/types/crm-documents.ts)
    // — a "marketing" template picked into a campaign uses those tag names, not the
    // ones above, so both must resolve or picked-template tags render as literal text.
    "[clientname]": displayName,
    "[companyphone]": companyPhone,
    "[clientaccountbalance]": balance,
  };
}

/** CAN-SPAM footer for bulk marketing sends — never appended to 1:1 emails. */
export function buildCanSpamFooter(
  orgName: string,
  orgAddress: { street?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null,
  unsubscribeUrl: string
): string {
  const addressLine = orgAddress?.street
    ? `${orgAddress.street}, ${orgAddress.city ?? ""} ${orgAddress.state ?? ""} ${orgAddress.zip ?? ""}`.trim()
    : "";
  return `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;line-height:1.5">
      <p style="margin:0 0 4px">${orgName}${addressLine ? ` &middot; ${addressLine}` : ""}</p>
      <p style="margin:0"><a href="${unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline">Unsubscribe from marketing emails</a></p>
    </div>
  `;
}

interface SendClientEmailOpts {
  to: string;
  subject: string;
  html: string;
}

/** Thin, single call site for outbound client emails — keeps `from` and error handling consistent. */
export async function sendClientEmail(opts: SendClientEmailOpts): Promise<{ resendId: string | null }> {
  const resend = new Resend(process.env.RESEND_API_KEY!);
  const { data, error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error) {
    throw new Error(error.message ?? "Failed to send email");
  }
  return { resendId: data?.id ?? null };
}
