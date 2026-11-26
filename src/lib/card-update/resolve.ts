import { cardUpdateTokenState, hashCardUpdateToken, looksLikeCardUpdateToken, type CardUpdateTokenState } from "@/lib/card-update/token";

// The service client's generated types don't cover this newer table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ResolvedCardUpdateToken {
  id: string;
  orgId: string;
  clientId: string;
  tokenHash: string;
  state: CardUpdateTokenState;
}

/**
 * Token -> org/client, server-side only. Null for anything that isn't a live row (bad format,
 * unknown, soft-deleted) so a guessed token and a revoked one look the same. `db` must be a
 * service-role client; callers scope every later query by the returned orgId/clientId, never
 * by anything the browser sends.
 */
export async function resolveCardUpdateToken(db: Db, token: string): Promise<ResolvedCardUpdateToken | null> {
  if (!looksLikeCardUpdateToken(token)) return null;
  const tokenHash = hashCardUpdateToken(token);
  const { data } = await db
    .from("card_update_tokens")
    .select("id, org_id, client_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    orgId: data.org_id as string,
    clientId: data.client_id as string,
    tokenHash,
    state: cardUpdateTokenState({ expires_at: data.expires_at as string, used_at: (data.used_at as string | null) ?? null }),
  };
}
