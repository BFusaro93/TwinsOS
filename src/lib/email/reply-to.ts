import "server-only";

/**
 * Where a customer's reply lands.
 *
 * Every outbound client email goes out FROM the shared verified sending
 * domain (noreply@landscapt.com, with the org's name as the display name —
 * see orgEmailFrom). That address is a dead end: until this existed, a client
 * who hit Reply on an invoice, an estimate or a note from the job screen was
 * writing to a mailbox nobody reads.
 *
 * The From address can't simply become the org's own — Resend only sends from
 * domains verified on the account, and a tenant's @theircompany.com is not one
 * of them. Reply-To has no such constraint, so that is the header that carries
 * the real mailbox.
 *
 * Two sources, in order:
 *   "user"    — the signed-in sender's own address, for a 1:1 email a person
 *               typed. Falls back to the org address when the caller has none.
 *   "company" — organizations.customizations.reply_to_email, set in Settings.
 *
 * Automated sends (invoices, estimates, campaigns, automations) always use the
 * company address: there is no person behind them to reply to.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

export type ReplyToMode = "company" | "user";

/** customizations key holding the org-wide reply address. */
export const ORG_REPLY_TO_KEY = "reply_to_email";

/**
 * Deliberately permissive — this is a header value we're echoing back, not a
 * deliverability guarantee. The point is to reject the shapes that would
 * break the header (whitespace, newlines, a missing @) rather than to police
 * what a valid mailbox looks like.
 */
export function isUsableReplyTo(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value.trim())
  );
}

/**
 * For the callers that already have the org row in hand (most of the send
 * routes select `customizations` for other reasons) — no second round trip.
 */
export function replyToFromCustomizations(customizations: unknown): string | null {
  const raw = (customizations as Record<string, unknown> | null | undefined)?.[ORG_REPLY_TO_KEY];
  return isUsableReplyTo(raw) ? raw.trim() : null;
}

/** The org's configured reply address, or null when it hasn't been set. */
export async function getOrgReplyTo(
  supabase: AnyClient,
  orgId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("customizations")
    .eq("id", orgId)
    .single();
  return replyToFromCustomizations(data?.customizations);
}

/**
 * Resolves a Reply-To for a send the caller chose the mode for.
 *
 * `userEmail` comes from the authenticated session, never from the request
 * body: the dialog sends a MODE, not an address, so a caller can't point
 * replies at a mailbox of their choosing and use the org's verified domain to
 * make it look legitimate.
 */
export async function resolveReplyTo(
  supabase: AnyClient,
  params: { orgId: string; mode: ReplyToMode; userEmail?: string | null }
): Promise<string | null> {
  if (params.mode === "user" && isUsableReplyTo(params.userEmail)) {
    return params.userEmail.trim();
  }
  return getOrgReplyTo(supabase, params.orgId);
}
