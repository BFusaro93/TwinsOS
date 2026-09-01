"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUserStore } from "@/stores";
import {
  useStaffConversationList,
  useOrgConversation,
  useSupportMessagesRealtime,
  useSendSupportMessage,
} from "@/lib/hooks/use-support-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function StaffChatPage() {
  const { currentUser } = useCurrentUserStore();
  const { data: conversations = [], isLoading } = useStaffConversationList(true);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useSupportMessagesRealtime(null);

  const selected = conversations.find((c) => c.orgId === selectedOrgId) ?? conversations[0] ?? null;
  const effectiveOrgId = selectedOrgId ?? selected?.orgId ?? null;

  return (
    <div className="flex h-full gap-4">
      <div className="w-72 shrink-0 overflow-y-auto rounded-lg border bg-white">
        {isLoading ? (
          <p className="p-4 text-sm text-slate-400">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No conversations yet.</p>
        ) : (
          conversations.map((c) => (
            <button
              key={c.orgId}
              onClick={() => setSelectedOrgId(c.orgId)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
                c.orgId === effectiveOrgId && "bg-brand-50"
              )}
            >
              <span className="text-sm font-medium text-slate-800">{c.orgName}</span>
              <span className="truncate text-xs text-slate-500">{c.lastMessage}</span>
            </button>
          ))
        )}
      </div>

      <div className="flex-1 rounded-lg border bg-white">
        {effectiveOrgId ? (
          <ConversationPane
            key={effectiveOrgId}
            orgId={effectiveOrgId}
            orgName={conversations.find((c) => c.orgId === effectiveOrgId)?.orgName ?? ""}
            staffName={currentUser.name}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            <MessageCircle className="mr-2 h-4 w-4" />
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationPane({ orgId, orgName, staffName }: { orgId: string; orgName: string; staffName: string }) {
  const { data: messages = [], isLoading } = useOrgConversation(orgId);
  const sendMessage = useSendSupportMessage();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await sendMessage.mutateAsync({ orgId, senderType: "staff", senderName: staffName, body });
    } catch (err) {
      console.error("[ConversationPane]", err);
      toast.error("Couldn't send that message.");
      setDraft(body);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3 font-medium text-slate-800">{orgName}</div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.senderType === "staff" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
                  m.senderType === "staff" ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-800"
                )}
              >
                {m.body}
              </div>
              <span className="mt-0.5 px-1 text-[10px] text-slate-400">
                {m.senderName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          rows={1}
          placeholder="Reply…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="min-h-9 resize-none"
        />
        <Button onClick={handleSend} disabled={sendMessage.isPending || !draft.trim()}>
          Send
        </Button>
      </div>
    </div>
  );
}
