"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { SupportThread } from "@/components/shared/SupportThread";
import { useCurrentUserStore } from "@/stores";
import {
  CONVERSATION_STATUS_LABEL,
  useConversationStatus,
  useSendSupportMessage,
  useSupportMessagesRealtime,
  type SupportMessage,
} from "@/lib/hooks/use-support-chat";

interface ChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  orgId: string;
  /** Whether the CURRENT VIEWER is staff (sends as "staff") or an org member (sends as "org"). */
  viewerIsStaff: boolean;
  viewerName: string;
  messages: SupportMessage[];
  isLoading: boolean;
}

export function ChatDialog({
  open,
  onOpenChange,
  title,
  orgId,
  viewerIsStaff,
  viewerName,
  messages,
  isLoading,
}: ChatDialogProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendMessage = useSendSupportMessage();
  const { currentUser } = useCurrentUserStore();
  // A customer's thread is their own: keyed by org + their user id.
  const { data: status } = useConversationStatus(open ? { orgId, threadUserId: currentUser.id } : null);

  useSupportMessagesRealtime(open ? orgId : null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    try {
      await sendMessage.mutateAsync({
        orgId,
        senderType: viewerIsStaff ? "staff" : "org",
        senderName: viewerName,
        body,
      });
    } catch (err) {
      console.error("[ChatDialog]", err);
      toast.error("Couldn't send that message. Please try again.");
      setDraft(body);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[32rem] max-w-md flex-col gap-0 p-0 sm:p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            {title}
            {status && messages.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-normal">{CONVERSATION_STATUS_LABEL[status]}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-400 dark:text-neutral-500">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-neutral-500">
              {viewerIsStaff
                ? "No messages yet."
                : "Send a message and our team will get back to you."}
            </p>
          ) : (
            <SupportThread messages={messages} viewerIsStaff={viewerIsStaff} viewerId={currentUser.id} />
          )}
        </div>

        {!viewerIsStaff && status === "resolved" && (
          <p className="border-t bg-muted/40 px-4 py-1.5 text-center text-xs text-slate-500 dark:text-neutral-400">
            This conversation is marked resolved. Send a message to reopen it.
          </p>
        )}
        <div className="flex items-end gap-2 border-t p-3">
          <Textarea
            rows={1}
            placeholder="Type a message…"
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
      </DialogContent>
    </Dialog>
  );
}
