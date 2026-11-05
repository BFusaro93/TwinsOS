"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

/** A live hard bounce on one email address (crm_email_bounces). */
export interface EmailBounce {
  id: string;
  email: string;
  bouncedAt: string;
  bounceMessage: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBounce(row: any): EmailBounce {
  return {
    id: row.id,
    email: row.email,
    bouncedAt: row.bounced_at,
    bounceMessage: row.bounce_message ?? null,
  };
}

/**
 * The bounced addresses to show on a client: bounces recorded against the
 * client's own messages (any of its recipients — primary, billing, contacts,
 * CCs) plus a bounce on its current primary/billing address recorded from
 * another client's message (the suppression is per address, org-wide).
 */
export function useClientEmailBounces(clientId: string, addresses: (string | null | undefined)[]) {
  const emails = Array.from(
    new Set(addresses.map((a) => a?.trim().toLowerCase()).filter((a): a is string => !!a)),
  ).sort();
  return useQuery({
    queryKey: ["email-bounces", clientId, emails],
    enabled: !!clientId,
    queryFn: async (): Promise<EmailBounce[]> => {
      const supabase = createClient();
      // Two filters rather than one .or(): an address can contain characters
      // PostgREST's or() syntax would need quoted.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- crm_email_bounces is newer than the generated types
      const db = supabase as any;
      const [byClient, byAddress] = await Promise.all([
        db.from("crm_email_bounces").select("id, email, bounced_at, bounce_message").eq("client_id", clientId).is("deleted_at", null),
        emails.length > 0
          ? db.from("crm_email_bounces").select("id, email, bounced_at, bounce_message").in("email", emails).is("deleted_at", null)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (byClient.error) throw byClient.error;
      if (byAddress.error) throw byAddress.error;
      const byId = new Map<string, EmailBounce>();
      for (const row of [...(byClient.data ?? []), ...(byAddress.data ?? [])]) byId.set(row.id, mapBounce(row));
      return Array.from(byId.values()).sort((a, b) => a.email.localeCompare(b.email));
    },
  });
}

/** "This mailbox works again" — lifts the bounce so every sender may use the address. */
export function useClearEmailBounce() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, clientId }: { email: string; clientId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC is newer than the generated types
      const { error } = await (supabase as any).rpc("crm_clear_email_bounce", { p_email: email, p_client_id: clientId });
      if (error) throw error;
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["email-bounces"] });
      // email_bounced_at on the client row is derived from the bounce.
      queryClient.invalidateQueries({ queryKey: ["clients", clientId], exact: true });
      queryClient.invalidateQueries({ queryKey: ["clients", clientId, "activity"] });
    },
  });
}
