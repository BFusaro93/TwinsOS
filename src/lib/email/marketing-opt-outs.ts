import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { normalizeEmailAddress } from "@/lib/email/bounced-addresses";

/**
 * Marketing opt-outs are honoured per email ADDRESS. Two client accounts can
 * share one mailbox (a second property, a property manager, a duplicate made
 * later); when either one is Do Not Market, marketing mail must not reach that
 * address through the other. The unsubscribe link opts out every account with
 * the address (crm_unsubscribe_client), and this send-time check covers an
 * account created or re-imported AFTER the unsubscribe.
 *
 * Service client + explicit org, like the bounce check: it must behave the same
 * for every sender (office, cron, automations). Fails closed.
 */

const log = logger.child("marketing-opt-outs");
const CHUNK = 500;

/** The subset of `addresses` (lowercased) that belong to a Do Not Market client in this org. */
export async function findMarketingOptedOutAddresses(
  orgId: string | null | undefined,
  addresses: readonly unknown[],
): Promise<Set<string>> {
  const wanted = Array.from(new Set(addresses.map(normalizeEmailAddress).filter((v): v is string => !!v)));
  const out = new Set<string>();
  if (!orgId || wanted.length === 0) return out;
  const db = createServiceClient();
  for (let i = 0; i < wanted.length; i += CHUNK) {
    const { data, error } = await db.rpc("crm_marketing_suppressed_emails", {
      p_org_id: orgId,
      p_emails: wanted.slice(i, i + CHUNK),
    });
    if (error) {
      log.error("opt-out lookup failed", { orgId, error: error.message });
      throw new Error("Could not check marketing opt-outs");
    }
    for (const email of (data ?? []) as string[]) out.add(email);
  }
  return out;
}
