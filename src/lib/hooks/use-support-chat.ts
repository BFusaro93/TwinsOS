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
  /** The customer user whose private thread this message is in. */
  threadUserId: string | null;
  senderType: "org" | "staff";
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
  /** Set once the sender has edited the text. */
  editedAt: string | null;
}

const MESSAGE_COLUMNS = "id, org_id, thread_user_id, sender_type, sender_id, sender_name, body, created_at, edited_at";

function mapMessage(row: {
  id: string;
  org_id: string;
  thread_user_id: string | null;
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
    threadUserId: row.thread_user_id,
    senderType: row.sender_type as "org" | "staff",
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}

/** The current user's own private thread with Landscapt support (RLS also limits reads to it). */
export function useMyConversation(orgId: string | undefined, userId: string | undefined) {
  return useQuery({
    queryKey: ["support-messages", "mine", orgId, userId],
    queryFn: async (): Promise<SupportMessage[]> => {
      const supabase = createClient();
      // The generated types predate edited_at, so the row shape is asserted.
      const { data, error } = await supabase
        .from("support_messages")
        .select(MESSAGE_COLUMNS)
        .eq("org_id", orgId!)
        .eq("thread_user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Parameters<typeof mapMessage>[0][]).map(mapMessage);
    },
    enabled: !!orgId && !!userId,
  });
}

/** Identifies one private thread: an org plus the customer user it belongs to (null for legacy staff-only threads). */
export interface ThreadRef {
  orgId: string;
  threadUserId: string | null;
}

export const threadKey = (t: ThreadRef) => `${t.orgId}:${t.threadUserId ?? "none"}`;

/** Staff inbox: every customer thread (one per person), most recent first. */
export function useStaffConversationList(enabled: boolean) {
  return useQuery({
    queryKey: ["support-messages", "staff-inbox"],
    queryFn: async () => {
      const supabase = createClient();
      // PostgREST caps a response at 1000 rows, so a single select silently dropped
      // every older thread once the table grew. Page until a short page comes back;
      // id breaks created_at ties so pages never skip or repeat rows.
      const pageSize = 1000;
      const data: {
        org_id: string; thread_user_id: string | null; body: string; sender_type: string; sender_name: string; created_at: string;
      }[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data: page, error } = await supabase
          .from("support_messages")
          .select("org_id, thread_user_id, body, sender_type, sender_name, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = (page ?? []) as unknown as typeof data;
        data.push(...rows);
        if (rows.length < pageSize) break;
      }

      // Org names come from the staff-only RPC: embedding organizations(name)
      // in the query above is filtered by RLS to the staff member's own org,
      // so every customer org came back null and rendered as "Unknown org".
      const { data: orgs, error: orgsError } = await supabase.rpc("list_organizations_for_staff");
      if (orgsError) throw orgsError;
      const orgNames = new Map((orgs as { id: string; name: string }[]).map((o) => [o.id, o.name]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: statusRows } = await (supabase as any).from("support_conversations").select("org_id, thread_user_id, status");
      const statusByThread = new Map<string, ConversationStatus>(
        ((statusRows ?? []) as { org_id: string; thread_user_id: string | null; status: ConversationStatus }[]).map(
          (r) => [threadKey({ orgId: r.org_id, threadUserId: r.thread_user_id }), r.status]
        )
      );

      type InboxRow = {
        orgId: string; threadUserId: string | null; orgName: string; personName: string;
        lastMessage: string; lastMessageAt: string; status: ConversationStatus;
      };
      const byThread = new Map<string, InboxRow>();
      // Newest first: the first row per thread is its latest message; the person's name is
      // the newest customer-side sender_name in it.
      for (const row of data) {
        const ref = { orgId: row.org_id, threadUserId: row.thread_user_id };
        const key = threadKey(ref);
        const existing = byThread.get(key);
        if (!existing) {
          byThread.set(key, {
            ...ref,
            orgName: orgNames.get(row.org_id) ?? "Unknown org",
            personName: row.sender_type === "org" ? row.sender_name : "",
            lastMessage: row.body,
            lastMessageAt: row.created_at,
            status: statusByThread.get(key) ?? "open",
          });
        } else if (!existing.personName && row.sender_type === "org") {
          existing.personName = row.sender_name;
        }
      }
      return Array.from(byThread.values());
    },
    enabled,
  });
}

/** Staff view of one customer thread. */
export function useThreadConversation(thread: ThreadRef | null) {
  return useQuery({
    queryKey: ["support-messages", "thread", thread ? threadKey(thread) : null],
    queryFn: async (): Promise<SupportMessage[]> => {
      if (!thread) return [];
      const supabase = createClient();
      let q = supabase.from("support_messages").select(MESSAGE_COLUMNS).eq("org_id", thread.orgId);
      q = thread.threadUserId ? q.eq("thread_user_id", thread.threadUserId) : q.is("thread_user_id", null);
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as Parameters<typeof mapMessage>[0][]).map(mapMessage);
    },
    enabled: !!thread,
  });
}

/** Status of one thread (open / in progress / resolved); null until it has any message. */
export function useConversationStatus(thread: ThreadRef | null | undefined) {
  return useQuery({
    queryKey: ["support-messages", "status", thread ? threadKey(thread) : null],
    queryFn: async (): Promise<ConversationStatus | null> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("support_conversations").select("status").eq("org_id", thread!.orgId);
      q = thread!.threadUserId ? q.eq("thread_user_id", thread!.threadUserId) : q.is("thread_user_id", null);
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return (data?.status as ConversationStatus | undefined) ?? null;
    },
    enabled: !!thread,
  });
}

/** Staff only (RLS enforces it): set a thread's status by hand. */
export function useSetConversationStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, threadUserId, status }: ThreadRef & { status: ConversationStatus }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("support_conversations")
        .upsert(
          { org_id: orgId, thread_user_id: threadUserId, status, status_changed_at: new Date().toISOString(), status_changed_by: user?.id ?? null },
          { onConflict: "org_id,thread_user_id" }
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
      /** Staff replies only: the customer user whose thread this answers. A customer's own messages always go to their own thread. */
      threadUserId?: string | null;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error } = await supabase
        .from("support_messages")
        .insert({
          org_id: input.orgId,
          thread_user_id: input.senderType === "org" ? user.id : (input.threadUserId ?? null),
          sender_type: input.senderType,
          sender_id: user.id,
          sender_name: input.senderName,
          body: input.body,
        })
      if (error) throw error;
      // Staff are emailed by the support-chat-notify cron when a customer message
      // has gone 5 minutes without a staff reply — nothing to fire from here.
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-messages"] });
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
