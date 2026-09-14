"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export interface TicketContributor {
  id: string;
  ticketId: string;
  userName: string;
  addedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContributor(row: any): TicketContributor {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    userName: row.user_name,
    addedAt: row.added_at,
  };
}

export function useTicketContributors(ticketId: string) {
  return useQuery({
    queryKey: ["ticket-contributors", ticketId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("ticket_contributors")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("added_at", { ascending: true });
      if (error) throw error;
      return (data as unknown[]).map(mapContributor);
    },
    enabled: !!ticketId,
  });
}

export function useAddTicketContributor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, userName }: { ticketId: string; userName: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("ticket_contributors")
        .insert({ ticket_id: ticketId, user_name: userName });
      if (error) throw error;
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ["ticket-contributors", ticketId] });
    },
    onError: () => {
      toast.error("Failed to add contributor");
    },
  });
}

export function useRemoveTicketContributor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ticketId }: { id: string; ticketId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("ticket_contributors")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { ticketId };
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ["ticket-contributors", ticketId] });
    },
    onError: () => {
      toast.error("Failed to remove contributor");
    },
  });
}
