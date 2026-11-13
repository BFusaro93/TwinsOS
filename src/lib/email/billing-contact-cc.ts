// No server-only imports: the invoice email dialog uses the same rules to prefill CC.

const normalizeEmailAddress = (raw: string): string | null => {
  const v = raw.trim().toLowerCase();
  return v === "" ? null : v;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** A contact typed "Billing" (any case; "Billing Contact" too) gets the client's bills. */
export function isBillingContactType(contactType: string | null | undefined): boolean {
  return /\bbilling\b/i.test(contactType ?? "");
}

/**
 * Email addresses of the client's live Billing contacts that are OK to email —
 * CC'd on invoice and statement emails. Org-filtered explicitly (the caller may
 * hold a service-role client).
 */
export async function fetchBillingContactCcEmails(
  db: AnyClient,
  params: { orgId: string; clientId: string },
): Promise<string[]> {
  const { data, error } = await db
    .from("client_contacts")
    .select("email, contact_type")
    .eq("org_id", params.orgId)
    .eq("client_id", params.clientId)
    .eq("ok_to_email", true)
    .is("deleted_at", null)
    .not("email", "is", null);
  if (error) throw error;
  return ((data ?? []) as { email: string | null; contact_type: string | null }[])
    .filter((c) => isBillingContactType(c.contact_type))
    .map((c) => (c.email ?? "").trim())
    .filter((e) => e.length > 0);
}

/**
 * `cc` plus `extra`, each address once, leaving out anything already in `to`
 * (case-insensitive) so nobody gets the same email twice.
 */
export function mergeCcRecipients(to: readonly string[], cc: readonly string[], extra: readonly string[]): string[] {
  const seen = new Set(to.map(normalizeEmailAddress).filter((v): v is string => !!v));
  const out: string[] = [];
  for (const raw of [...cc, ...extra]) {
    const key = normalizeEmailAddress(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}
