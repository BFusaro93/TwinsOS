"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, Send, LifeBuoy } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useAskAI } from "@/lib/hooks/use-ask-ai";
import { useSendAskAIToSupport } from "@/lib/hooks/use-ask-ai-escalation";
import { useAddonAccess } from "@/lib/hooks/use-module-access";
import { useCurrentUserStore } from "@/stores";
import { cn } from "@/lib/utils";

interface AskAIPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The model writes **bold** for emphasis; render it rather than showing the asterisks. */
function renderBold(text: string) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    )
  );
}

export function AskAIPanel({ open, onOpenChange }: AskAIPanelProps) {
  const [input, setInput] = useState("");
  const { messages, ask, isStreaming, error, reset } = useAskAI();
  const pathname = usePathname();
  const { currentUser } = useCurrentUserStore();
  const { allowed: hasChatSupport } = useAddonAccess("chat_support");
  const sendToSupport = useSendAskAIToSupport({
    orgId: currentUser.orgId,
    senderName: currentUser.name,
    hasChatSupport,
  });
  const [escalating, setEscalating] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const hasAnswer = messages.some((m) => m.role === "assistant" && m.content.trim());

  async function handleSendToSupport() {
    try {
      await sendToSupport.mutateAsync({ messages, note, pageUrl: pathname ?? "" });
      setSent(true);
      setEscalating(false);
      setNote("");
      toast.success("Sent to support — they'll reply to you directly.");
    } catch {
      toast.error("Couldn't send to support. Please try again.");
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      setEscalating(false);
      setNote("");
      setSent(false);
    }
    onOpenChange(next);
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || isStreaming) return;
    setInput("");
    await ask(question);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex h-[600px] max-h-[80vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            Ask AI
          </DialogTitle>
          <DialogDescription>
            Answers are generated from our help guides and data model — verify anything critical. If this
            doesn&apos;t solve it, you can send the conversation to our team.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 rounded-md border border-slate-100 dark:border-neutral-800 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-neutral-500">
              Ask a &ldquo;how do I&rdquo; question, or ask whether something is actually tracked in the app.
            </p>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    m.role === "user"
                      ? "ml-auto bg-slate-900 text-white"
                      : "bg-muted text-slate-900 dark:text-neutral-100"
                  )}
                >
                  {m.content
                    ? m.role === "assistant"
                      ? renderBold(m.content)
                      : m.content
                    : isStreaming && i === messages.length - 1
                      ? "…"
                      : ""}
                </div>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        </ScrollArea>

        {hasAnswer && !isStreaming && (
          <div className="rounded-md border border-slate-200 dark:border-neutral-800 p-2">
            {sent ? (
              <p className="text-xs text-slate-500 dark:text-neutral-400">
                Conversation sent to support. You can keep asking questions here in the meantime.
              </p>
            ) : escalating ? (
              <div className="flex flex-col gap-2">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything to add? (optional)"
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEscalating(false)} disabled={sendToSupport.isPending}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSendToSupport} disabled={sendToSupport.isPending}>
                    {sendToSupport.isPending ? "Sending…" : "Send to support"}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEscalating(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                <LifeBuoy className="h-3.5 w-3.5" />
                Didn&apos;t answer it? Send this conversation to support
              </button>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Ask a question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isStreaming}
          />
          <Button onClick={handleSend} disabled={isStreaming || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
