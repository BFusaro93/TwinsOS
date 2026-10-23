import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";

export type ConversationStatus = "open" | "in_progress" | "resolved";

export const CONVERSATION_STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
};

export interface SupportMessage {
  id: string;
  orgId: string;
  senderType: "org" | "staff";
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
  /** Set once the sender has edited the text. */
  editedAt: string | null;
}

const MESSAGE_COLUMNS = "id, org_id, sender_type, sender_id, sender_name, body, created_at, edited_at";

function mapMessage(row: {
  id: string;
  org_id: string;
  sender_type: string;
  sender_id: string | null;
  sender_name: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}): SupportMessage {
  return {
    id: row.id,
    orgId: row.org_id,
    senderType: row.sender_type as "org" | "staff",
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

/** The current user's own org's conversation with Landscapt support. */
export function useMyConversation(orgId: string | undefined) {
  return useQuery({
    queryKey: ["support-messages", "mine", orgId],
    queryFn: async (): Promise<SupportMessage[]> => {
      const supabase = createClient();
      // The generated types predate edited_at, so the row shape is asserted.
      const { data, error } = await supabase
        .from("support_messages")
        .select(MESSAGE_COLUMNS)
        .eq("org_id", orgId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Parameters<typeof mapMessage>[0][]).map(mapMessage);
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
        .select("org_id, body, sender_type, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Org names come from the staff-only RPC: embedding organizations(name)
      // in the query above is filtered by RLS to the staff member's own org,
      // so every customer org came back null and rendered as "Unknown org".
      const { data: orgs, error: orgsError } = await supabase.rpc("list_organizations_for_staff");
      if (orgsError) throw orgsError;
      const orgNames = new Map((orgs as { id: string; name: string }[]).map((o) => [o.id, o.name]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: statusRows } = await (supabase as any).from("support_conversations").select("org_id, status");
      const statusByOrg = new Map<string, ConversationStatus>(
        ((statusRows ?? []) as { org_id: string; status: ConversationStatus }[]).map((r) => [r.org_id, r.status])
      );

      const byOrg = new Map<string, {
        orgId: string; orgName: string; lastMessage: string; lastMessageAt: string; status: ConversationStatus;
      }>();
      for (const row of data) {
        if (!byOrg.has(row.org_id)) {
          byOrg.set(row.org_id, {
            orgId: row.org_id,
            orgName: orgNames.get(row.org_id) ?? "Unknown org",
            lastMessage: row.body,
            lastMessageAt: row.created_at,
            status: statusByOrg.get(row.org_id) ?? "open",
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
        .select(MESSAGE_COLUMNS)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Parameters<typeof mapMessage>[0][]).map(mapMessage);
    },
    enabled: !!orgId,
  });
}

/** Status of one org's thread (open / in progress / resolved); null until it has any message. */
export function useConversationStatus(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["support-messages", "status", orgId],
    queryFn: async (): Promise<ConversationStatus | null> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("support_conversations")
        .select("status")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.status as ConversationStatus | undefined) ?? null;
    },
    enabled: !!orgId,
  });
}

/** Staff only (RLS enforces it): set a thread's status by hand. */
export function useSetConversationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, status }: { orgId: string; status: ConversationStatus }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("support_conversations")
        .upsert(
          { org_id: orgId, status, status_changed_at: new Date().toISOString(), status_changed_by: user?.id ?? null },
          { onConflict: "org_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-messages"] }),
  });
}

/** Edit the text of a message you sent; the database refuses anyone else's, and anything but the body. */
export function useEditSupportMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const supabase = createClient();
      const { error } = await supabase.from("support_messages").update({ body }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-messages"] }),
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
      /** Email Landscapt staff about this message (default true). Ask AI escalations opt out: support@ gets its own email. */
      notifyStaff?: boolean;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: inserted, error } = await supabase
        .from("support_messages")
        .insert({
          org_id: input.orgId,
          sender_type: input.senderType,
          sender_id: user.id,
          sender_name: input.senderName,
          body: input.body,
        })
        .select("id")
        .single();
      if (error) throw error;

      // A customer message emails Landscapt staff (new conversation, a reply
      // to staff, or after a quiet gap). Best-effort — the message is saved.
      if (input.senderType === "org" && input.notifyStaff !== false) {
        void fetch("/api/support/notify-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inserted.id }),
        }).catch(() => {});
      }
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
          event: "*",
          schema: "public",
          table: "support_messages",
          ...(orgId ? { filter: `org_id=eq.${orgId}` } : {}),
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["support-messages"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "support_conversations",
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
