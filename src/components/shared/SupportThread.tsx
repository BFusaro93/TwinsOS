"use client";

import { Fragment, useState, type ReactNode } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditSupportMessage, type SupportMessage } from "@/lib/hooks/use-support-chat";

const TOKEN = /(\*\*[^*\n]+\*\*|https?:\/\/[^\s<]+)/g;

/**
 * Message text with line breaks kept, **bold** rendered, and http(s) links made
 * clickable. Everything else is plain text — never HTML — so a message can't
 * inject markup; only http/https URLs become links.
 */
export function formatChatText(text: string, linkClass: string): ReactNode[] {
  return text.split("\n").flatMap((line, li, lines) => {
    // flatMap joins every line into ONE child list, so keys must be unique across lines,
    // not just within one (keys restarting at 0 on each line made React mix up the bold
    // pieces on re-render, e.g. while typing a reply, and stack their text together).
    const parts = line.split(TOKEN).map((part, i): ReactNode => {
      const key = `${li}-${i}`;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={key}>{part.slice(2, -2)}</strong>;
      }
      if (/^https?:\/\//.test(part)) {
        // Trailing punctuation belongs to the sentence, not the URL.
        const trailing = /[.,;:!?)\]]+$/.exec(part)?.[0] ?? "";
        const url = trailing ? part.slice(0, -trailing.length) : part;
        return (
          <Fragment key={key}>
            <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>{url}</a>
            {trailing}
          </Fragment>
        );
      }
      return part;
    });
    return li < lines.length - 1 ? [...parts, <br key={`br-${li}`} />] : parts;
  });
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

interface SupportThreadProps {
  messages: SupportMessage[];
  /** Whether the viewer is staff — decides which side counts as "mine". */
  viewerIsStaff: boolean;
  /** The viewer's profile id: only your own messages can be edited. */
  viewerId: string;
}

/** The message list shared by the customer chat dialog and the staff inbox. */
export function SupportThread({ messages, viewerIsStaff, viewerId }: SupportThreadProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const edit = useEditSupportMessage();

  async function save(m: SupportMessage) {
    const body = draft.trim();
    if (!body || body === m.body) { setEditingId(null); return; }
    try {
      await edit.mutateAsync({ id: m.id, body });
      setEditingId(null);
    } catch {
      toast.error("Couldn't save that edit. Please try again.");
    }
  }

  return (
    <>
      {messages.map((m, i) => {
        const isOwnSide = viewerIsStaff ? m.senderType === "staff" : m.senderType === "org";
        const canEdit = !!viewerId && m.senderId === viewerId;
        const newDay = i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt);
        const editing = editingId === m.id;
        return (
          <Fragment key={m.id}>
            {newDay && (
              <div className="flex items-center gap-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                <span className="h-px flex-1 bg-border" />
                {dayLabel(m.createdAt)}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            <div className={cn("group flex flex-col", isOwnSide ? "items-end" : "items-start")}>
              {editing ? (
                <div className="w-full max-w-[85%] space-y-1.5">
                  <Textarea
                    autoFocus
                    rows={3}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(m); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => void save(m)} disabled={edit.isPending || !draft.trim()}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className={cn("flex max-w-[85%] items-center gap-1", isOwnSide && "flex-row-reverse")}>
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm break-words",
                      isOwnSide ? "bg-brand-500 text-white" : "bg-muted text-slate-800 dark:text-neutral-100"
                    )}
                  >
                    {formatChatText(m.body, isOwnSide ? "underline break-all" : "text-brand-600 underline break-all dark:text-brand-400")}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      title="Edit message"
                      onClick={() => { setDraft(m.body); setEditingId(m.id); }}
                      className="shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:text-slate-600 focus:opacity-100 group-hover:opacity-100 dark:text-neutral-500"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit message</span>
                    </button>
                  )}
                </div>
              )}
              <span className="mt-0.5 px-1 text-[10px] text-slate-400 dark:text-neutral-500">
                {m.senderName} · {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                {m.editedAt && " · edited"}
              </span>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
