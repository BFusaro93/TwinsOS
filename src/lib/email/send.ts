import { Resend } from "resend";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";

export const EMAIL_FROM = "Landscapt <noreply@landscapt.com>";
/** Same mailbox/domain as EMAIL_FROM — only the display name differs, for CMMS/Equipt-triggered notifications (work orders, maintenance requests, PO/requisitions). */
export const EMAIL_FROM_EQUIPT = "Equipt <noreply@landscapt.com>";

/**
 * Escapes text for safe interpolation into HTML markup. Merge-tag values
 * here originate from freeform fields (client display name, org name/phone)
 * that staff — or in some flows an external submitter — control; without
 * this, a name containing `<`/`&`/quotes breaks the HTML or, worse, injects
 * markup/script into an email actually delivered to a real recipient (same
 * class of bug fixed for form-submission notification emails).
 */
function escapeHtml(text: string): string {
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

interface ClientForMergeVars {
  displayName: string | null;
  balanceOutstandingCents?: number | null;
}

interface OrgForMergeVars {
  name: string | null;
  addressPhone?: string | null;
}

/** Shared merge vars available to any client-facing email (individual or bulk). */
export function buildClientMergeVars(
  client: ClientForMergeVars,
  org: OrgForMergeVars
): Record<string, string> {
  // Compute names/split from the raw value, then escape only at the point
  // of exposure below — escaping first would corrupt the split (e.g. an
  // embedded "&" becoming "&amp;" before the space-split runs).
  const rawDisplayName = client.displayName ?? "";
  const rawFirstName = rawDisplayName.split(" ")[0] ?? rawDisplayName;
  const rawLastName = rawDisplayName.split(" ").slice(1).join(" ");
  const balance = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((client.balanceOutstandingCents ?? 0) / 100);

  const displayName = escapeHtml(rawDisplayName);
  const firstName = escapeHtml(rawFirstName);
  const lastName = escapeHtml(rawLastName);
  const companyName = escapeHtml(org.name ?? "Your Service Provider");
  const companyPhone = escapeHtml(org.addressPhone ?? "");

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
