// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** Reuses an existing (non-expired) share token for the invoice, or mints a
 *  new one. Called whenever an invoice is emailed or downloaded so the
 *  "View Your Invoice Online" link always resolves — never on the public
 *  read path itself. */
export async function getOrCreateInvoiceShareToken(
  supabase: AnyClient,
  params: { orgId: string; invoiceId: string; createdBy?: string | null }
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("invoice_share_tokens")
    .select("token, expires_at")
    .eq("invoice_id", params.invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && (!existing.expires_at || new Date(existing.expires_at) > new Date())) {
    return existing.token as string;
  }

  const { data: created, error } = await supabase
    .from("invoice_share_tokens")
    .insert({
      org_id: params.orgId,
      invoice_id: params.invoiceId,
      created_by: params.createdBy ?? null,
    })
    .select("token")
    .single();

  if (error || !created) return null;
  return created.token as string;
}

export function buildInvoiceViewUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://twins-os.vercel.app";
  return `${base}/invoice/${token}`;
}
