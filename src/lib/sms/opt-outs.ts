import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { stripPhoneExtension } from "@/lib/utils/phone";

/**
 * Per-number SMS opt-outs (crm_sms_opt_outs). A STOP from ANY number we text —
 * the client's primary phone, a number on its phone list, a contact — is kept
 * against that number, so later texts to it are skipped while the client's
 * other numbers still get messages. clients.sms_opt_in remains the client's own
 * consent and only flips when the primary phone sends the keyword.
 * See 20261220000501_sms_number_opt_outs.sql.
 */

const log = logger.child("sms-opt-outs");

/** Mirrors the SQL phone_last10(): extension dropped, digits only, last 10. */
export function phoneLast10(phone: string | null | undefined): string | null {
  const digits = stripPhoneExtension(phone ?? "").replace(/\D/g, "").slice(-10);
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

/** How a number's consent was revoked — crm_sms_opt_outs.source / clients.sms_opt_out_source. */
export type SmsOptOutSource = "keyword" | "keyword_in_message" | "carrier_blocked";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/**
 * Per-contact consent (client_contacts.sms_opt_in) follows the contact's own
 * number: a STOP or carrier block from any number on a contact turns that
 * contact's consent off; a START from a contact's main phone turns it back on.
 * Runs crm_set_contact_sms_consent_by_number (service role only). Returns an
 * error message on failure, null on success. Idempotent.
 */
export async function setContactSmsConsentByNumber(
  supabase: AnyClient,
  params: { orgId: string; last10: string; optIn: boolean; source: SmsOptOutSource | "keyword" },
): Promise<string | null> {
  if (!/^[0-9]{10}$/.test(params.last10)) return null;
  const { error } = await supabase.rpc("crm_set_contact_sms_consent_by_number", {
    p_org_id: params.orgId,
    p_last10: params.last10,
    p_opt_in: params.optIn,
    p_source: params.source,
  });
  return error ? error.message : null;
}

/**
 * Twilio error 21610: the number is on Twilio's / the carrier's opt-out list
 * (it texted STOP at that layer, e.g. while our webhook was down, or to a
 * Messaging Service with Advanced Opt-Out). Record a per-number opt-out for the
 * number ACTUALLY texted, and turn off the client's own consent only when that
 * number is the client's primary phone — a contact's block isn't the client's.
 * Returns an error message on failure, null on success. Idempotent.
 */
export async function recordCarrierOptOut(
  supabase: AnyClient,
  params: { orgId: string; clientId: string | null; phone: string | null | undefined; messageSid: string | null },
): Promise<string | null> {
  const last10 = phoneLast10(params.phone);
  if (!last10) return null;
  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_sms_opt_outs").insert({
    org_id: params.orgId,
    phone_last10: last10,
    client_id: params.clientId,
    source_message_sid: params.messageSid,
    source: "carrier_blocked",
    matched_keyword: null,
    opted_out_at: now,
  });
  // 23505 = already a live opt-out for this number in the org.
  if (error && error.code !== "23505") return error.message;

  const contactErr = await setContactSmsConsentByNumber(supabase, {
    orgId: params.orgId, last10, optIn: false, source: "carrier_blocked",
  });
  if (contactErr) return contactErr;

  if (params.clientId) {
    const { data: client, error: readErr } = await supabase
      .from("clients")
      .select("primary_phone, sms_opt_in")
      .eq("id", params.clientId)
      .eq("org_id", params.orgId)
      .maybeSingle();
    if (readErr) return readErr.message;
    if (client && phoneLast10(client.primary_phone) === last10 && client.sms_opt_in) {
      const { error: optErr } = await supabase
        .from("clients")
        .update({ sms_opt_in: false, sms_opt_out_at: now, sms_opt_out_source: "carrier_blocked" })
        .eq("id", params.clientId)
        .eq("org_id", params.orgId);
      if (optErr) return optErr.message;
    }
  }
  return null;
}
