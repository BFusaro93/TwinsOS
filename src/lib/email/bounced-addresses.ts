import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Hard bounces are remembered per email ADDRESS (crm_email_bounces), not per
 * client. A client often gets mail at several addresses — primary, billing,
 * contacts, a CC — and one dead address used to block every send to the
 * client, including its good primary. Every sender now drops just the bounced
 * recipients and keeps mailing the rest.
 *
 * clients.email_bounced_at is kept in sync by the database to mean "this
 * client's PRIMARY address has bounced" (see
 * 20261220000500_email_address_bounces.sql), so primary-only senders and the
 * existing reports/filters can keep reading it.
 *
 * Reads go through the service client with an explicit org filter: the check
 * has to work the same for every sender (office, crew, portal, cron), and an
 * RLS-hidden row would silently let a dead address through.
 */

const log = logger.child("email-bounces");

export function normalizeEmailAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return v === "" ? null : v;
}

/** The subset of `addresses` that have a live hard bounce in this org (lowercased). */
export async function findBouncedAddresses(orgId: string | null | undefined, addresses: readonly unknown[]): Promise<Set<string>> {
  const wanted = Array.from(new Set(addresses.map(normalizeEmailAddress).filter((v): v is string => !!v)));
  if (!orgId || wanted.length === 0) return new Set();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- crm_email_bounces is newer than the generated types
  const { data, error } = await (createServiceClient() as any)
    .from("crm_email_bounces")
    .select("email")
    .eq("org_id", orgId)
    .in("email", wanted)
    .is("deleted_at", null);
  if (error) {
    // Fail closed: a lookup error must not turn into mailing dead addresses.
    log.error("bounce lookup failed", { orgId, error: error.message });
    throw new Error("Could not check bounced addresses");
  }
  return new Set(((data ?? []) as { email: string }[]).map((r) => r.email));
}

/** Splits recipients into the ones still deliverable and the ones that hard-bounced, keeping the caller's spelling. */
export async function partitionBouncedRecipients(
  orgId: string | null | undefined,
  recipients: readonly string[],
): Promise<{ deliverable: string[]; bounced: string[] }> {
  const bouncedSet = await findBouncedAddresses(orgId, recipients);
  const deliverable: string[] = [];
  const bounced: string[] = [];
  for (const r of recipients) {
    const key = normalizeEmailAddress(r);
    if (!key) continue;
    (bouncedSet.has(key) ? bounced : deliverable).push(r);
  }
  return { deliverable, bounced };
}

/** The 422 message when every recipient of a send has hard-bounced. */
export function allRecipientsBouncedMessage(bounced: readonly string[]): string {
  const list = bounced.join(", ");
  return bounced.length === 1
    ? `${list} has hard-bounced, so it can't receive email. Update the address, send to a different one, or clear the bounce on the client if it was fixed.`
    : `These addresses have hard-bounced, so they can't receive email: ${list}. Update them, send to a different address, or clear the bounce on the client if they were fixed.`;
}
