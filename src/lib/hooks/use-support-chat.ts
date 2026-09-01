import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface SupportMessage {
  id: string;
  orgId: string;
  senderType: "org" | "staff";
  senderName: string;
  body: string;
  createdAt: string;
}

function mapMessage(row: {
  id: string;
  org_id: string;
  sender_type: string;
  sender_name: string;
  body: string;
  created_at: string;
}): SupportMessage {
  return {
    id: row.id,
    orgId: row.org_id,
    senderType: row.sender_type as "org" | "staff",
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** The current user's own org's conversation with Landscapt support. */
export function useMyConversation(orgId: string | undefined) {
  return useQuery({
    queryKey: ["support-messages", "mine", orgId],
    queryFn: async (): Promise<SupportMessage[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, org_id, sender_type, sender_name, body, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(mapMessage);
    },
    enabled: !!orgId,
  });
}

/** Staff inbox: every org that has a conversation, most recent first. */
export function useStaffConversationList(enabled: boolean) {
  return useQuery({
    queryKey: ["support-messages", "staff-inbox"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("support_messages")
        .select("org_id, body, sender_type, created_at, organizations(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const byOrg = new Map<string, { orgId: string; orgName: string; lastMessage: string; lastMessageAt: string }>();
      for (const row of data as unknown as {
        org_id: string;
        body: string;
        created_at: string;
        organizations: { name: string } | null;
      }[]) {
        if (!byOrg.has(row.org_id)) {
          byOrg.set(row.org_id, {
            orgId: row.org_id,
            orgName: row.organizations?.name ?? "Unknown org",
            lastMessage: row.body,
            lastMessageAt: row.created_at,
          });
        }
      }
      return Array.from(byOrg.values());
    },
    enabled,
  });
}

/** Staff view of a specific org's conversation. */
export function useOrgConversation(orgId: string | null) {
  return useQuery({
    queryKey: ["support-messages", "org", orgId],
    queryFn: async (): Promise<SupportMessage[]> => {
      if (!orgId) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from("support_messages")
        .select("id, org_id, sender_type, sender_name, body, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(mapMessage);
    },
    enabled: !!orgId,
  });
}

export function useSendSupportMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      senderType: "org" | "staff";
      senderName: string;
      body: string;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase.from("support_messages").insert({
        org_id: input.orgId,
        sender_type: input.senderType,
        sender_id: user.id,
        sender_name: input.senderName,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["support-messages", "mine"] });
      queryClient.invalidateQueries({ queryKey: ["support-messages", "org", variables.orgId] });
      queryClient.invalidateQueries({ queryKey: ["support-messages", "staff-inbox"] });
    },
  });
}

/**
 * Realtime updates for a support conversation. Pass null for orgId to
 * subscribe broadly (the staff inbox, which needs to hear about every org's
 * new messages); pass a specific orgId to scope to just that conversation.
 */
export function useSupportMessagesRealtime(orgId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`support-messages:${orgId ?? "all"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          ...(orgId ? { filter: `org_id=eq.${orgId}` } : {}),
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["support-messages"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}
