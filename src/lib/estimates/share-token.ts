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
