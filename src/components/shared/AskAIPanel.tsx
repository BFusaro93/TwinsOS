"use client";

import { useState } from "react";
import { Sparkles, Send } from "lucide-react";
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
import { useAskAI } from "@/lib/hooks/use-ask-ai";
import { cn } from "@/lib/utils";

interface AskAIPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AskAIPanel({ open, onOpenChange }: AskAIPanelProps) {
  const [input, setInput] = useState("");
  const { messages, ask, isStreaming, error, reset } = useAskAI();

  function handleOpenChange(next: boolean) {
    if (!next) reset();
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
            <Sparkles className="h-4 w-4 text-emerald-700" />
            Ask AI
          </DialogTitle>
          <DialogDescription>
            Answers are generated from our help guides and data model — verify anything critical, or use the
            feedback widget to reach the team.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 rounded-md border border-slate-100 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">
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
                      : "bg-slate-100 text-slate-900"
                  )}
                >
                  {m.content || (isStreaming && i === messages.length - 1 ? "…" : "")}
                </div>
              ))}
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </ScrollArea>

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
