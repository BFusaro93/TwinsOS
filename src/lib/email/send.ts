import { Resend } from "resend";
import { KNOWN_MERGE_TAG_KEYS } from "@/lib/utils/document-template-renderer";

export const EMAIL_FROM = "Twins Lawn Service <noreply@twinslawnservice.com>";

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
  const displayName = client.displayName ?? "";
  const firstName = displayName.split(" ")[0] ?? displayName;
  const lastName = displayName.split(" ").slice(1).join(" ");
  const balance = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
    .format((client.balanceOutstandingCents ?? 0) / 100);

  return {
    "[clientfirstname]": firstName,
    "[clientlastname]": lastName,
    "[clientfullname]": displayName,
    "[companyname]": org.name ?? "Your Service Provider",
    "[companyphonenumber]": org.addressPhone ?? "",
    "[accountbalance]": balance,
    // Aliases for the Documents module's merge-tag vocabulary (src/types/crm-documents.ts)
    // — a "marketing" template picked into a campaign uses those tag names, not the
    // ones above, so both must resolve or picked-template tags render as literal text.
    "[clientname]": displayName,
    "[companyphone]": org.addressPhone ?? "",
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
