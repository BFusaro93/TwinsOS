import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Per-number SMS opt-outs (crm_sms_opt_outs). A STOP from ANY number we text —
 * the client's primary phone, a number on its phone list, a contact — is kept
 * against that number, so later texts to it are skipped while the client's
 * other numbers still get messages. clients.sms_opt_in remains the client's own
 * consent and only flips when the primary phone sends the keyword.
 * See 20261220000501_sms_number_opt_outs.sql.
 */

const log = logger.child("sms-opt-outs");

/** Mirrors the SQL phone_last10(): digits only, last 10. */
export function phoneLast10(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : null;
}

/** The subset of `phones` (as last-10 keys) that texted STOP to this org. */
export async function findOptedOutNumbers(orgId: string, phones: readonly (string | null | undefined)[]): Promise<Set<string>> {
  const keys = Array.from(new Set(phones.map(phoneLast10).filter((k): k is string => !!k)));
  if (keys.length === 0) return new Set();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- crm_sms_opt_outs is newer than the generated types
  const { data, error } = await (createServiceClient() as any)
    .from("crm_sms_opt_outs")
    .select("phone_last10")
    .eq("org_id", orgId)
    .in("phone_last10", keys)
    .is("deleted_at", null);
  if (error) {
    // Fail closed: a lookup error must not text someone who said STOP.
    log.error("opt-out lookup failed", { orgId, error: error.message });
    throw new Error("Could not check SMS opt-outs");
  }
  return new Set(((data ?? []) as { phone_last10: string }[]).map((r) => r.phone_last10));
}
