"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUserStore } from "@/stores";
import {
  CONVERSATION_STATUS_LABEL,
  useStaffConversationList,
  useThreadConversation,
  threadKey,
  type ThreadRef,
  useSupportMessagesRealtime,
  useSendSupportMessage,
  useSetConversationStatus,
  type ConversationStatus,
} from "@/lib/hooks/use-support-chat";
import { SupportThread } from "@/components/shared/SupportThread";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const STATUS_DOT: Record<ConversationStatus, string> = {
  open: "bg-red-500",
  in_progress: "bg-amber-500",
  resolved: "bg-green-500",
};

type StatusFilter = "active" | ConversationStatus | "all";
const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export default function StaffChatPage() {
  const { currentUser } = useCurrentUserStore();
  const { data: conversations = [], isLoading } = useStaffConversationList(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("active");

  useSupportMessagesRealtime(null);

  const visible = conversations.filter((c) =>
    filter === "all" ? true : filter === "active" ? c.status !== "resolved" : c.status === filter
  );
  // Keep the open thread on screen even after it's resolved out of the filter.
  const selected = conversations.find((c) => threadKey(c) === selectedKey) ?? visible[0] ?? null;

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-lg border bg-white">
        <div className="flex flex-wrap gap-1 border-b p-2">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs transition-colors",
                filter === f.value ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">
              {conversations.length === 0 ? "No conversations yet." : "Nothing in this view."}
            </p>
          ) : (
            visible.map((c) => (
              <button
                key={threadKey(c)}
                onClick={() => setSelectedKey(threadKey(c))}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b px-4 py-3 text-left transition-colors hover:bg-slate-50",
                  selected && threadKey(c) === threadKey(selected) && "bg-brand-50"
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[c.status])} title={CONVERSATION_STATUS_LABEL[c.status]} />
                  {c.orgName}
                  {c.personName && <span className="font-normal text-slate-500">· {c.personName}</span>}
                </span>
                <span className="truncate text-xs text-slate-500">{c.lastMessage}</span>
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 rounded-lg border bg-white">
        {selected ? (
          <ConversationPane
            key={threadKey(selected)}
            thread={{ orgId: selected.orgId, threadUserId: selected.threadUserId }}
            orgName={selected.orgName}
            personName={selected.personName}
            staffName={currentUser.name}
            staffId={currentUser.id}
            status={selected.status}
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

function ConversationPane({ thread, orgName, personName, staffName, staffId, status }: { thread: ThreadRef; orgName: string; personName: string; staffName: string; staffId: string; status: ConversationStatus }) {
  const { data: messages = [], isLoading } = useThreadConversation(thread);
  const sendMessage = useSendSupportMessage();
  const setStatus = useSetConversationStatus();
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
      await sendMessage.mutateAsync({ orgId: thread.orgId, threadUserId: thread.threadUserId, senderType: "staff", senderName: staffName, body });
    } catch (err) {
      console.error("[ConversationPane]", err);
      toast.error("Couldn't send that message.");
      setDraft(body);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <span className="font-medium text-slate-800">{orgName}{personName ? ` · ${personName}` : ""}</span>
        <div className="flex gap-1">
          {(["open", "in_progress", "resolved"] as ConversationStatus[]).map((st) => (
            <button
              key={st}
              disabled={setStatus.isPending}
              onClick={() => st !== status && setStatus.mutate(
                { ...thread, status: st },
                { onError: () => toast.error("Couldn't change the status.") }
              )}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                st === status ? "border-brand-500 bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[st])} />
              {CONVERSATION_STATUS_LABEL[st]}
            </button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <SupportThread messages={messages} viewerIsStaff viewerId={staffId} />
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
