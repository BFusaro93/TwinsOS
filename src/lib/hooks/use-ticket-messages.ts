"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";

export interface TicketMessage {
  id: string;
  authorType: "client" | "staff";
  authorName: string;
  body: string;
  photos?: { url: string; name: string }[];
  createdAt: string;
}

/** The customer-visible conversation on a ticket (not the internal Comments tab). */
export function useTicketMessages(ticketId: string) {
  return useQuery<TicketMessage[]>({
    queryKey: ["ticket-messages", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const res = await fetch(`/api/crm/tickets/${ticketId}/messages`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't load the conversation");
      return json as TicketMessage[];
    },
    refetchInterval: 30_000,
  });
}

export function useReplyToTicketClient(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await fetch(`/api/crm/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't send your reply");
      return json as { emailed: boolean; message: TicketMessage };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-messages", ticketId] }),
  });
}
