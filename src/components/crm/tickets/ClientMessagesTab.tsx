"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { useTicketMessages, useReplyToTicketClient } from "@/lib/hooks/use-ticket-messages";

/**
 * The conversation the CLIENT sees in their portal: their replies and ours.
 * Distinct from Comments & History, which stays internal.
 */
export function ClientMessagesTab({ ticketId, visibleToClient }: { ticketId: string; visibleToClient: boolean }) {
  const { data: messages = [], isLoading, error } = useTicketMessages(ticketId);
  const reply = useReplyToTicketClient(ticketId);
  const [draft, setDraft] = useState("");

  async function send() {
    const body = draft.trim();
    if (!body) return;
    try {
      const res = await reply.mutateAsync(body);
      setDraft("");
      toast.success(res.emailed ? "Reply sent — the client was emailed" : "Reply sent to the client's portal");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your reply");
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <p className="text-xs text-muted-foreground">
        Messages here are visible to the client in their portal, and they are emailed when you reply. Use Comments &amp; History for internal notes.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{(error as Error).message}</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No messages with the client yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`max-w-[88%] rounded-xl px-3 py-2 ${
                m.authorType === "client" ? "mr-auto rounded-tl-sm bg-slate-100 dark:bg-muted" : "ml-auto rounded-tr-sm bg-brand-50 dark:bg-brand-900/30"
              }`}
            >
              <p className="whitespace-pre-wrap text-sm">{m.body}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {m.authorType === "client" ? `${m.authorName} (client)` : m.authorName} · {formatDateTime(m.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {!visibleToClient && (
        <p className="rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          This ticket isn&apos;t shared with the client. Turn on &ldquo;Show in client portal&rdquo; (Details tab) before replying.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="Reply to the client…"
          disabled={!visibleToClient}
        />
        <Button onClick={send} disabled={!visibleToClient || !draft.trim() || reply.isPending} className="self-end gap-2">
          {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send reply
        </Button>
      </div>
    </div>
  );
}
