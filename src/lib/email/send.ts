import "server-only";
import { Resend } from "resend";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";
import { escapeHtml } from "@/lib/utils/escape-html";

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

// escapeHtml now lives in lib/utils/escape-html so the document template
// renderer (which client components import) can use it without pulling this
// module — and with it the Resend SDK — into the browser bundle. Re-exported
// for the server-side callers that already import it from here.
export { escapeHtml };

/** Replaces `[token]` placeholders (case-insensitive) with resolved values. */
export function resolveMergeTags(template: string, vars: Record<string, string>): string {
  return template.replace(/\[(\w+)\]/g, (match) => {
    const key = match.toLowerCase();
    // `?? ""` guards the case where a builder supplied the key with an
    // undefined value: `key in vars` is true, so without it the recipient
    // would read the literal word "undefined" in a real email.
    if (key in vars) return vars[key] ?? "";
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
  firstName?: string | null;
  lastName?: string | null;
  primaryEmail?: string | null;
  phones?: { phone: string; type: string }[] | null;
  accountNumber?: string | null;
  invoiceDelivery?: string | null;
  billingAddress?: string | null;
  billingCity?: string | null;
  billingState?: string | null;
  billingZip?: string | null;
  serviceAddress?: string | null;
  serviceCity?: string | null;
  serviceState?: string | null;
  serviceZip?: string | null;
  turfSqft?: number | null;
  grossSqft?: number | null;
  mulchBedSqft?: number | null;
  yardsOfMulch?: number | null;
  linearFtPerimeter?: number | null;
  linearFtEdging?: number | null;
  gateLockCode?: string | null;
  notesToCrew?: string | null;
  /** "Firstname Lastname" of the linked crm_employees rep — resolved by the caller, this fn does no DB lookups. */
  salesRepName?: string | null;
  /** Display name of the linked referring client, falling back to the free-text `referred_by` (e.g. "Google", "Yard Sign") — resolved by the caller. */
  referringClientName?: string | null;
}

interface OrgForMergeVars {
  name: string | null;
  addressPhone?: string | null;
  addressStreet?: string | null;
  addressCity?: string | null;
  addressState?: string | null;
  addressZip?: string | null;
  /**
   * The org's operating timezone, for [today]. Required rather than defaulted:
   * the Node runtime is UTC on Vercel, so a missing zone silently dates an
   * evening email tomorrow, and an implicit Eastern fallback silently gives a
   * Pacific org the wrong day. Callers resolve it with getOrgTimeZone().
   */
  timeZone: string;
}

const INVOICE_DELIVERY_LABELS: Record<string, string> = {
  email: "Email",
  print: "Print",
  both: "Email & Print",
};

function formatSqft(n: number | null | undefined): string {
  return n == null ? "" : new Intl.NumberFormat("en-US").format(n);
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
  // embedded "&" becoming "&amp;" before the space-split runs). Prefer the
  // client's real first_name/last_name columns when the caller supplied
  // them; fall back to splitting display_name for callers that don't (or
  // for clients that only ever had a free-text display name).
  const rawDisplayName = client.displayName ?? "";
  const rawFirstName = client.firstName ?? rawDisplayName.split(" ")[0] ?? rawDisplayName;
  const rawLastName = client.lastName ?? rawDisplayName.split(" ").slice(1).join(" ");
  const balance = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((client.balanceOutstandingCents ?? 0) / 100);

  const displayName = esc(rawDisplayName);
  const firstName = esc(rawFirstName);
  const lastName = esc(rawLastName);
  const companyName = esc(org.name ?? "Your Service Provider");
  const companyPhone = esc(org.addressPhone ?? "");
  const companyAddress = esc(org.addressStreet ?? "");
  const companyCity = esc(org.addressCity ?? "");
  const companyState = esc(org.addressState ?? "");
  const companyZip = esc(org.addressZip ?? "");

  const phoneOfType = (type: string) => esc(client.phones?.find((p) => p.type === type)?.phone ?? "");
  const referringClient = esc(client.referringClientName ?? "");
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: org.timeZone,
  });

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
    "[clientemail]": esc(client.primaryEmail ?? ""),
    "[clienthomephone]": phoneOfType("home"),
    "[clientworkphone]": phoneOfType("work"),
    "[clientcellphone]": phoneOfType("cell"),
    "[clientotherphone]": phoneOfType("other"),
    "[clientfax]": phoneOfType("fax"),
    "[accountnumber]": esc(client.accountNumber ?? ""),
    "[howwebillyou]": esc(INVOICE_DELIVERY_LABELS[client.invoiceDelivery ?? ""] ?? ""),
    "[salesperson]": esc(client.salesRepName ?? ""),
    "[referringclient]": referringClient,
    "[billingaddress1]": esc(client.billingAddress ?? ""),
    "[billingcity]": esc(client.billingCity ?? ""),
    "[billingstate]": esc(client.billingState ?? ""),
    "[billingzip]": esc(client.billingZip ?? ""),
    "[physicaladdress1]": esc(client.serviceAddress ?? ""),
    "[physicalcity]": esc(client.serviceCity ?? ""),
    "[physicalstate]": esc(client.serviceState ?? ""),
    "[physicalzip]": esc(client.serviceZip ?? ""),
    "[turfsqft]": formatSqft(client.turfSqft),
    "[grosssqft]": formatSqft(client.grossSqft),
    "[mulchbedsqft]": formatSqft(client.mulchBedSqft),
    "[yardsofmulch]": formatSqft(client.yardsOfMulch),
    "[linearfeetperimeter]": formatSqft(client.linearFtPerimeter),
    "[linearfeetedging]": formatSqft(client.linearFtEdging),
    "[gatecode]": esc(client.gateLockCode ?? ""),
    "[notestocrew]": esc(client.notesToCrew ?? ""),
    "[companyaddress]": companyAddress,
    "[companycity]": companyCity,
    "[companystate]": companyState,
    "[companyzip]": companyZip,
    "[today]": today,
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
