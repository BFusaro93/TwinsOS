// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/** Reuses an existing (non-expired, non-revoked) share token for the
 *  invoice, or mints a new one. Called whenever an invoice is emailed or
 *  downloaded so the "View Your Invoice Online" link always resolves —
 *  never on the public read path itself. Re-sending/re-downloading an
 *  invoice therefore also refreshes an about-to-expire link. */
export async function getOrCreateInvoiceShareToken(
  supabase: AnyClient,
  params: { orgId: string; invoiceId: string; createdBy?: string | null }
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("invoice_share_tokens")
    .select("token, expires_at, revoked_at")
    .eq("invoice_id", params.invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    existing &&
    !existing.revoked_at &&
    (!existing.expires_at || new Date(existing.expires_at) > new Date())
  ) {
    return existing.token as string;
  }

  const { data: created, error } = await supabase
    .from("invoice_share_tokens")
    .insert({
      org_id: params.orgId,
      invoice_id: params.invoiceId,
      created_by: params.createdBy ?? null,
      expires_at: new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString(),
    })
    .select("token")
    .single();

  if (error || !created) return null;
  return created.token as string;
}

/** Revokes every live share token for an invoice — e.g. the org wants to
 *  cut off a link they suspect was forwarded/leaked. Org-scoped so a caller
 *  can't revoke another org's tokens by guessing an invoice id. */
export async function revokeInvoiceShareTokens(
  supabase: AnyClient,
  params: { orgId: string; invoiceId: string }
): Promise<void> {
  await supabase
    .from("invoice_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", params.orgId)
    .eq("invoice_id", params.invoiceId)
    .is("revoked_at", null);
}

export function buildInvoiceViewUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://landscapt.com";
  return `${base}/invoice/${token}`;
}
