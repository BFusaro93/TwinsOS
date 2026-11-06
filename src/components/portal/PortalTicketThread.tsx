"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";

interface Message {
  id: string;
  authorType: "client" | "staff";
  authorName: string;
  body: string;
  photos?: { url: string; name: string }[];
  createdAt: string;
}

interface ThreadResponse {
  status: string;
  messages: Message[];
}

const MAX_CHARS = 2000;
const MAX_PHOTOS = 5;

function MessagePhotos({ photos }: { photos?: { url: string; name: string }[] }) {
  if (!photos?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map((p) => (
        <a key={p.url} href={p.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={p.name} loading="lazy" className="h-20 w-20 rounded-md border object-cover" />
        </a>
      ))}
    </div>
  );
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * One ticket's conversation: what the customer originally wrote, then the
 * back-and-forth with the office, plus a reply box. A reply to a closed ticket
 * reopens it (the server does that; this just says so up front).
 */
export function PortalTicketThread({
  ticket,
  onClose,
  onReplied,
}: {
  ticket: { id: string; ticket_number: number; subject: string | null; body: string | null; category: string | null; status: string; created_at: string };
  onClose: () => void;
  /** Called after a reply so the list can show a reopened ticket as open. */
  onReplied: (reopened: boolean) => void;
}) {
  const qc = useQueryClient();
  const key = ["portal-ticket-thread", ticket.id];
  const [draft, setDraft] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error: loadError } = useQuery<ThreadResponse>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/portal/tickets/${ticket.id}/messages`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't load the conversation");
      return json as ThreadResponse;
    },
    // Pick up the office's replies while the dialog is open.
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: async ({ body, files }: { body: string; files: File[] }) => {
      const form = new FormData();
      form.append("body", body);
      for (const f of files) form.append("files", f);
      const res = await fetch(`/api/portal/tickets/${ticket.id}/messages`, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Couldn't send your message");
      return json as { reopened: boolean; message: Message };
    },
    onSuccess: (r) => {
      setDraft("");
      setPhotos([]);
      setError(null);
      qc.setQueryData<ThreadResponse>(key, (cur) => ({
        status: r.reopened ? "open" : (cur?.status ?? ticket.status),
        messages: [...(cur?.messages ?? []), r.message],
      }));
      onReplied(r.reopened);
    },
    onError: (e: Error) => setError(e.message),
  });

  const messages = data?.messages ?? [];
  const status = data?.status ?? ticket.status;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{ticket.subject ?? `Ticket #${ticket.ticket_number}`}</h2>
            <p className="text-xs text-slate-500">
              #{ticket.ticket_number}
              {ticket.category ? ` · ${ticket.category}` : ""} · Opened {new Date(ticket.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {ticket.body && (
            <div className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-brand-50 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-slate-800">{ticket.body}</p>
              <p className="mt-1 text-[10px] text-slate-400">You · {fmtWhen(ticket.created_at)}</p>
            </div>
          )}
          {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-300" />}
          {loadError && <p className="text-sm text-red-600">{(loadError as Error).message}</p>}
          {!isLoading && !loadError && messages.length === 0 && (
            <p className="py-4 text-center text-xs text-slate-400">No replies yet. We&apos;ll answer here, and by email.</p>
          )}
          {messages.map((m) =>
            m.authorType === "client" ? (
              <div key={m.id} className="ml-auto max-w-[85%] rounded-xl rounded-tr-sm bg-brand-50 px-3 py-2">
                {m.body && <p className="whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>}
                <MessagePhotos photos={m.photos} />
                <p className="mt-1 text-[10px] text-slate-400">You · {fmtWhen(m.createdAt)}</p>
              </div>
            ) : (
              <div key={m.id} className="mr-auto max-w-[85%] rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2">
                {m.body && <p className="whitespace-pre-wrap text-sm text-slate-800">{m.body}</p>}
                <MessagePhotos photos={m.photos} />
                <p className="mt-1 text-[10px] text-slate-400">
                  {m.authorName || "Our team"} · {fmtWhen(m.createdAt)}
                </p>
              </div>
            )
          )}
          <div ref={endRef} />
        </div>

        <form
          className="border-t px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim() || photos.length) send.mutate({ body: draft.trim(), files: photos });
          }}
        >
          {status === "closed" && (
            <p className="mb-2 text-xs text-slate-500">This request is closed. Sending a message will reopen it.</p>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
            rows={3}
            placeholder="Write a message…"
            className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
              setPhotos((cur) => [...cur, ...picked].slice(0, MAX_PHOTOS));
              if (fileInput.current) fileInput.current.value = "";
            }}
          />
          {photos.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {photos.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1 py-0.5 text-xs text-slate-600">
                  <span className="max-w-[9rem] truncate">{f.name}</span>
                  <button type="button" onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-slate-200" aria-label={`Remove ${f.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {photos.length < MAX_PHOTOS && (
                <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800">
                  <Paperclip className="h-3.5 w-3.5" />
                  Add photo
                </button>
              )}
              <span className="text-[10px] text-slate-400">
                {draft.length}/{MAX_CHARS}
              </span>
            </div>
            <button
              type="submit"
              disabled={send.isPending || (!draft.trim() && photos.length === 0)}
              className="flex h-9 items-center gap-2 rounded-md bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:opacity-50"
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
