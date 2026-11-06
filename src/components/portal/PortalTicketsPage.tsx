"use client";

import { useRef, useState } from "react";
import { Ticket, Plus, Loader2, CheckCircle2, Clock, AlertCircle, XCircle, ChevronDown, Paperclip, X } from "lucide-react";
import { SubAccountLabel } from "@/components/portal/SubAccountLabel";
import { PortalTicketThread } from "@/components/portal/PortalTicketThread";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open:    { label: "Open",    color: "bg-blue-50 text-blue-700 border-blue-200",   icon: <Clock className="h-3.5 w-3.5" /> },
  on_hold: { label: "On Hold", color: "bg-yellow-50 text-yellow-700 border-yellow-200", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  pending: { label: "Pending", color: "bg-orange-50 text-orange-700 border-orange-200", icon: <Clock className="h-3.5 w-3.5" /> },
  closed:  { label: "Closed",  color: "bg-slate-100 text-slate-500 border-slate-200",   icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
};

interface Ticket {
  id: string;
  ticket_number: number;
  subject: string | null;
  category: string | null;
  status: string;
  priority: string;
  created_at: string;
  body: string | null;
  /** Set when the ticket is on one of the login's sub-accounts. */
  accountName?: string | null;
}

/** An account a ticket can be filed under: the login's own client first,
 * then its sub-accounts. */
interface TicketAccount {
  id: string;
  displayName: string;
  isSelf: boolean;
}

interface Props {
  tickets: Ticket[];
  categories: string[];
  accounts: TicketAccount[];
}

const DEFAULT_CATEGORIES = ["General", "Billing", "Service Issue", "Other"];

/** Matches the server cap in /api/portal/tickets/[id]/attachments. */
const MAX_PHOTOS = 5;

function NewTicketDialog({
  categories,
  accounts,
  onCreated,
}: {
  categories: string[];
  accounts: TicketAccount[];
  onCreated: (ticket: Ticket) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    setPhotos((cur) => [...cur, ...images].slice(0, MAX_PHOTOS));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !category) return;
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/portal/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, category, body, clientId: accountId || undefined }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSubmitting(false);
      setError(data.error ?? "Failed to submit ticket");
      return;
    }

    // The ticket exists now, so a photo that won't upload is reported but never
    // blocks it — the customer shouldn't resubmit (and double-file) over a photo.
    let failedPhotos = 0;
    for (const photo of photos) {
      const fd = new FormData();
      fd.append("file", photo);
      const up = await fetch(`/api/portal/tickets/${data.ticket.id}/attachments`, { method: "POST", body: fd }).catch(() => null);
      if (!up?.ok) failedPhotos += 1;
    }
    setSubmitting(false);
    if (failedPhotos > 0) {
      window.alert(`Your ticket was sent, but ${failedPhotos} photo${failedPhotos === 1 ? "" : "s"} couldn't be uploaded. Reply to our email or call us to send ${failedPhotos === 1 ? "it" : "them"}.`);
    }

    onCreated({
      id: data.ticket.id,
      ticket_number: data.ticket.ticket_number,
      subject,
      category,
      status: "open",
      priority: "normal",
      created_at: new Date().toISOString(),
      body,
      accountName: accounts.find((a) => a.id === accountId && !a.isSelf)?.displayName ?? null,
    });

    setSubject("");
    setBody("");
    setPhotos([]);
    setCategory(categories[0] ?? "");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-9 px-4 rounded-md bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition"
      >
        <Plus className="h-4 w-4" />
        New Ticket
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Submit a Ticket</h2>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 flex flex-col gap-4">
          {accounts.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">Account</label>
              <div className="relative">
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  className="w-full h-9 appearance-none rounded-md border border-slate-200 bg-white px-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.isSelf ? `${a.displayName || "My account"} (main account)` : a.displayName}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Category</label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full h-9 appearance-none rounded-md border border-slate-200 bg-white px-3 pr-8 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              >
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">Subject</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of the issue"
              className="h-9 rounded-md border border-slate-200 px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">
              Details <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Provide any additional details that might help us resolve your issue…"
              rows={4}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">
              Photos <span className="text-slate-400 font-normal">(optional, up to {MAX_PHOTOS})</span>
            </label>
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
            {photos.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {photos.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 pl-2.5 pr-1 py-0.5 text-xs text-slate-600">
                    <span className="max-w-[10rem] truncate">{f.name}</span>
                    <button type="button" onClick={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-slate-200" aria-label={`Remove ${f.name}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex w-fit items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Add photo
              </button>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-4 rounded-md border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !subject.trim() || !category}
              className="h-9 px-4 rounded-md bg-brand-500 text-white text-sm font-medium flex items-center gap-2 hover:bg-brand-600 transition disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Ticket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PortalTicketsPage({ tickets: initialTickets, categories: categoriesProp, accounts }: Props) {
  const [tickets, setTickets] = useState(initialTickets);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const openTicket = tickets.find((x) => x.id === openTicketId) ?? null;
  const categories = categoriesProp.length > 0 ? categoriesProp : DEFAULT_CATEGORIES;

  const open = tickets.filter((t) => t.status !== "closed");
  const closed = tickets.filter((t) => t.status === "closed");

  function renderList(list: Ticket[]) {
    return (
      <ul className="flex flex-col gap-2">
        {list.map((t) => {
          const cfg = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.open;
          return (
            <li
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenTicketId(t.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenTicketId(t.id); } }}
              className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-start gap-3 cursor-pointer hover:border-slate-300 hover:shadow-sm transition"
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-50 shrink-0 mt-0.5">
                <Ticket className="h-4 w-4 text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-slate-800">{t.subject ?? `Ticket #${t.ticket_number}`}</p>
                  <span className="text-xs text-slate-400">#{t.ticket_number}</span>
                </div>
                <SubAccountLabel name={t.accountName} />
                {t.category && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                    <span className="text-slate-400">Category:</span>
                    {t.category}
                  </span>
                )}
                {t.body && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.body}</p>
                )}
                <p className="text-xs text-slate-400 mt-1">Opened: {fmtDate(t.created_at)}</p>
              </div>
              <span className={`flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 shrink-0 ${cfg.color}`}>
                {cfg.icon}
                {cfg.label}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Tickets</h1>
        <NewTicketDialog
          categories={categories}
          accounts={accounts}
          onCreated={(t) => setTickets((prev) => [t, ...prev])}
        />
      </div>

      {tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Ticket className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 font-medium">No tickets yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Have a question or issue? Submit a ticket and we&apos;ll get back to you.</p>
          <div className="flex justify-center">
            <NewTicketDialog
              categories={categories}
              accounts={accounts}
              onCreated={(t) => setTickets((prev) => [t, ...prev])}
            />
          </div>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Open</h2>
              {renderList(open)}
            </section>
          )}
          {closed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Closed</h2>
              {renderList(closed)}
            </section>
          )}
        </>
      )}
    {openTicket && (
        <PortalTicketThread
          ticket={openTicket}
          onClose={() => setOpenTicketId(null)}
          onReplied={(reopened) => {
            if (reopened) setTickets((prev) => prev.map((x) => (x.id === openTicket.id ? { ...x, status: "open" } : x)));
          }}
        />
      )}
    </div>
  );
}
