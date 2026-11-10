/**
 * Estimate proposal share links (estimate_share_tokens).
 *
 * One estimate should have at most one LIVE public link at a time — a token
 * is live while it is not deleted, not yet accepted and not expired. Both the
 * send-email route and the share-link route (Copy/Open proposal link in the
 * estimate header) resolve the live token through this helper so they never
 * disagree about which link the client has.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface LiveShareToken {
  id: string;
  token: string;
  expiresAt: string | null;
}

/**
 * The expiry for a proposal link: the requested lifetime, but never before the
 * estimate's Valid until date is over — a link that died on day 30 of a
 * 60-day quote stranded the client with an estimate they could still accept.
 * `requested` null means "never expires" and is kept. Valid until is a
 * calendar date in the org's timezone; the link is held to the end of the
 * following UTC day so no US timezone loses its last day. (Acceptance itself
 * is still refused past Valid until by isEstimatePastValidUntil.) Once
 * accepted, a link stays viewable regardless of this date.
 */
export function shareLinkExpiry(requested: string | null, validUntilDate: string | null | undefined): string | null {
  if (requested === null) return null;
  if (!validUntilDate || !/^\d{4}-\d{2}-\d{2}$/.test(validUntilDate)) return requested;
  const coverValidUntil = new Date(`${validUntilDate}T23:59:59.000Z`).getTime() + 86_400_000;
  return new Date(Math.max(new Date(requested).getTime(), coverValidUntil)).toISOString();
}

export function proposalUrlFor(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://landscapt.com"}/proposal/${token}`;
}

export async function findLiveShareToken(
  supabase: AnySupabase,
  estimateId: string,
): Promise<LiveShareToken | null> {
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("estimate_share_tokens")
    .select("id, token, expires_at")
    .eq("estimate_id", estimateId)
    .is("deleted_at", null)
    .is("accepted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data as { id: string; token: string; expires_at: string | null }[] | null)?.[0];
  return row ? { id: row.id, token: row.token, expiresAt: row.expires_at } : null;
}
