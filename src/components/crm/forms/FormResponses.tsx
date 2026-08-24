"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFormResponses, useMarkFormResponseRead } from "@/lib/hooks/use-crm-forms";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ExternalLink, Paperclip, RotateCcw, Search, Ticket, User } from "lucide-react";
import type { CRMFormResponse, FormResponseStatus } from "@/types/crm-forms";

// ── Attachment values ─────────────────────────────────────────────────────────

interface AttachmentValue {
  path: string;
  name: string;
  size: number;
}

function isAttachmentValue(v: unknown): v is AttachmentValue {
  return typeof v === "object" && v !== null && "path" in v && "name" in v;
}

async function downloadAttachment(path: string) {
  try {
    const res = await fetch("/api/crm/forms/attachments/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Failed to get download link");
    window.open(body.url, "_blank", "noopener,noreferrer");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Failed to download attachment");
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

type QuickFilter = "all" | FormResponseStatus;

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all",       label: "All" },
  { key: "on_hold",   label: "On Hold" },
  { key: "completed", label: "Completed" },
  { key: "spam",      label: "Spam" },
  { key: "ignored",   label: "Ignored" },
];

// ── ResponseDetail ────────────────────────────────────────────────────────────

function ResponseDetailPanel({ response, onClose }: { response: CRMFormResponse; onClose: () => void }) {
  const router = useRouter();
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-[420px] md:w-[420px] border-l bg-white shadow-xl flex flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <p className="font-semibold text-slate-800">{response.submittedByName ?? "Anonymous"}</p>
          <p className="text-xs text-slate-400">{response.formName} — {fmtDate(response.createdAt)}</p>
        </div>
        <button onClick={onClose} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
          Close
        </button>
      </div>
      {(response.relatedTicketId || response.relatedClientId) && (
        <div className="flex items-center gap-2 border-b bg-slate-50 px-5 py-2.5">
          {response.relatedTicketId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => router.push(`/crm/tickets?open=${response.relatedTicketId}`)}
            >
              <Ticket className="h-3.5 w-3.5" />
              View Ticket
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          {response.relatedClientId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => router.push(`/crm/clients/${response.relatedClientId}`)}
            >
              <User className="h-3.5 w-3.5" />
              View Client
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Email</p>
            <p className="text-slate-700">{response.submittedByEmail ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Result</p>
            <p className="text-slate-700">{response.result ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Status</p>
            <p className="capitalize text-slate-700">{response.status}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-0.5">Source</p>
            <p className="text-slate-700">{response.formLocation ?? "—"}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">Submitted Data</p>
          <div className="rounded-lg border divide-y text-xs">
            {Object.entries(response.data).map(([k, v]) => (
              <div key={k} className="px-3 py-2 flex gap-3">
                <span className="w-32 shrink-0 font-medium text-slate-600">{k}</span>
                {isAttachmentValue(v) ? (
                  <button
                    type="button"
                    onClick={() => downloadAttachment(v.path)}
                    className="flex items-center gap-1 text-brand-600 hover:underline"
                  >
                    <Paperclip className="h-3 w-3 shrink-0" />
                    {v.name} ({Math.round(v.size / 1024)} KB)
                  </button>
                ) : v == null ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <span className="text-slate-800 break-all">{String(v)}</span>
                )}
              </div>
            ))}
            {Object.keys(response.data).length === 0 && (
              <div className="px-3 py-4 text-center text-slate-400">No data</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── FormResponses ─────────────────────────────────────────────────────────────

interface Props {
  formId: string;
}

export function FormResponses({ formId }: Props) {
  const { data: responses = [], isLoading, refetch } = useFormResponses(formId);
  const markRead = useMarkFormResponseRead();
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selected, setSelected] = useState<CRMFormResponse | null>(null);

  function openResponse(r: CRMFormResponse) {
    setSelected(r);
    if (!r.isRead) markRead.mutate({ id: r.id, isRead: true });
  }

  const stats = useMemo(() => ({
    total:     responses.length,
    on_hold:   responses.filter((r) => r.status === "on_hold").length,
    completed: responses.filter((r) => r.status === "completed").length,
    unread:    responses.filter((r) => !r.isRead).length,
  }), [responses]);

  const quickCounts: Record<QuickFilter, number> = {
    all:       responses.length,
    on_hold:   stats.on_hold,
    completed: stats.completed,
    spam:      responses.filter((r) => r.status === "spam").length,
    ignored:   responses.filter((r) => r.status === "ignored").length,
  };

  const filtered = useMemo(() => {
    let list = responses;
    if (quickFilter !== "all") list = list.filter((r) => r.status === quickFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        (r.submittedByName ?? "").toLowerCase().includes(q) ||
        (r.submittedByEmail ?? "").toLowerCase().includes(q) ||
        (r.result ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [responses, quickFilter, search]);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total",     value: stats.total,     color: "text-slate-900" },
          { label: "On Hold",   value: stats.on_hold,   color: "text-sky-600" },
          { label: "Completed", value: stats.completed, color: "text-green-600" },
          { label: "Unread",    value: stats.unread,    color: "text-orange-500" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Dark actions bar */}
      <div className="flex items-center bg-[#4a4a4a] px-4 py-2">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a] text-xs px-3">
                Actions <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => refetch()}>Refresh</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <div className="ml-2 flex items-center gap-1">
            {QUICK_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setQuickFilter(key)}
                className={cn(
                  "flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                  quickFilter === key ? "bg-white text-slate-800" : "text-slate-300 hover:text-white"
                )}
              >
                {label}
                {quickCounts[key] > 0 && (
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    quickFilter === key ? "bg-slate-200 text-slate-700" : "bg-white/20 text-white"
                  )}>
                    {quickCounts[key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search responses…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 border-b z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-4 px-4 py-3" />
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted By</th>
              <th className="px-4 py-3">Date Submitted</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center text-sm text-slate-400">
                  {responses.length === 0 ? "No responses yet" : "No responses match your filter"}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b hover:bg-slate-50 cursor-pointer"
                  onClick={() => openResponse(r)}
                >
                  <td className="px-4 py-3">
                    {!r.isRead && (
                      <span className="block h-2 w-2 rounded-full bg-brand-500" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase border",
                      r.status === "completed"
                        ? "bg-green-50 text-green-700 border-green-200"
                        : r.status === "spam"
                        ? "bg-red-50 text-red-600 border-red-200"
                        : "bg-sky-50 text-sky-700 border-sky-200"
                    )}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.submittedByName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(r.createdAt)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.submittedByEmail ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.formLocation ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{r.result ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelected(null)} />
          <ResponseDetailPanel response={selected} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  );
}
