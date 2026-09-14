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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
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
      <DialogContent className="flex h-[32rem] max-w-md flex-col gap-0 p-0">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-slate-400">
              {viewerIsStaff
                ? "No messages yet."
                : "Send a message and our team will get back to you."}
            </p>
          ) : (
            messages.map((m) => {
              const isOwnSide = viewerIsStaff ? m.senderType === "staff" : m.senderType === "org";
              return (
                <div key={m.id} className={cn("flex flex-col", isOwnSide ? "items-end" : "items-start")}>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2 text-sm",
                      isOwnSide
                        ? "bg-brand-500 text-white"
                        : "bg-slate-100 text-slate-800"
                    )}
                  >
                    {m.body}
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-slate-400">
                    {m.senderName} ·{" "}
                    {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
              );
            })
          )}
        </div>

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
