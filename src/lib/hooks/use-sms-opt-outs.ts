"use client";

import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { phoneDedupeKey } from "@/lib/utils/phone";

/** A live per-number SMS opt-out (crm_sms_opt_outs). */
export interface SmsOptOut {
  id: string;
  phoneLast10: string;
  optedOutAt: string;
  /** keyword | keyword_in_message (re-confirm) | carrier_blocked (Twilio 21610) */
  source: string;
  matchedKeyword: string | null;
}

/**
 * The numbers on this client (primary, phone list, contacts) that texted STOP
 * or are blocked at the carrier — plus any opt-out recorded against the client
 * itself. Read-only: an opt-out is lifted only by the texter replying START.
 */
export function useClientSmsOptOuts(clientId: string, phones: (string | null | undefined)[]) {
  const keys = Array.from(
    new Set(phones.map((p) => phoneDedupeKey(p)).filter((k): k is string => !!k && k.length === 10)),
  ).sort();
  return useQuery({
    queryKey: ["sms-opt-outs", clientId, keys],
    enabled: !!clientId,
    queryFn: async (): Promise<SmsOptOut[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- crm_sms_opt_outs is newer than the generated types
      const db = createClient() as any;
      const cols = "id, phone_last10, opted_out_at, source, matched_keyword";
      const [byClient, byNumber] = await Promise.all([
        db.from("crm_sms_opt_outs").select(cols).eq("client_id", clientId).is("deleted_at", null),
        keys.length > 0
          ? db.from("crm_sms_opt_outs").select(cols).in("phone_last10", keys).is("deleted_at", null)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (byClient.error) throw byClient.error;
      if (byNumber.error) throw byNumber.error;
      const byId = new Map<string, SmsOptOut>();
      for (const row of [...(byClient.data ?? []), ...(byNumber.data ?? [])]) {
        byId.set(row.id, {
          id: row.id,
          phoneLast10: row.phone_last10,
          optedOutAt: row.opted_out_at,
          source: row.source ?? "keyword",
          matchedKeyword: row.matched_keyword ?? null,
        });
      }
      return Array.from(byId.values()).sort((a, b) => a.phoneLast10.localeCompare(b.phoneLast10));
    },
  });
}
