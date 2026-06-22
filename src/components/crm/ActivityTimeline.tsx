"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClientActivity, useAddClientNote } from "@/lib/hooks/use-clients";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  FileText,
  DollarSign,
  Calendar,
  ClipboardList,
  Zap,
  MessageSquare,
  Plus,
  Ticket,
} from "lucide-react";
import type { ClientActivity } from "@/types/crm";

const TYPE_META: Record<
  string,
  { icon: React.ElementType; color: string; label: string }
> = {
  note:      { icon: MessageSquare, color: "bg-slate-100 text-slate-600",  label: "Note" },
  call:      { icon: Phone,         color: "bg-blue-100 text-blue-600",    label: "Call" },
  email:     { icon: Mail,          color: "bg-indigo-100 text-indigo-600", label: "Email" },
  invoice:   { icon: FileText,      color: "bg-amber-100 text-amber-700",  label: "Invoice" },
  payment:   { icon: DollarSign,    color: "bg-green-100 text-green-700",  label: "Payment" },
  job_visit: { icon: Calendar,      color: "bg-teal-100 text-teal-700",    label: "Visit" },
  estimate:  { icon: ClipboardList, color: "bg-purple-100 text-purple-700", label: "Estimate" },
  contract:  { icon: FileText,      color: "bg-orange-100 text-orange-700", label: "Contract" },
  automation:{ icon: Zap,           color: "bg-pink-100 text-pink-700",    label: "Automation" },
  ticket:    { icon: Ticket,        color: "bg-red-100 text-red-600",      label: "Ticket" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function activityHref(item: ClientActivity): string | null {
  if (item.activityType === "invoice" && item.refId) return `/crm/accounting/invoices/${item.refId}`;
  if (item.activityType === "estimate" && item.refId) return `/crm/estimates/${item.refId}`;
  return null;
}

function ActivityRow({ item, onTicketClick }: { item: ClientActivity; onTicketClick?: (id: string) => void }) {
  const meta = TYPE_META[item.activityType] ?? TYPE_META.note;
  const Icon = meta.icon;
  const router = useRouter();
  const href = activityHref(item);

  const isTicketEntry = (item.activityType === "ticket" || item.refTable === "crm_tickets") && !!item.refId;

  function handleClick() {
    if (isTicketEntry && onTicketClick) {
      onTicketClick(item.refId!);
    } else if (href) {
      router.push(href);
    }
  }

  const isClickable = (isTicketEntry && !!onTicketClick) || !!href;

  return (
    <div
      className={`flex gap-3 py-3 ${isClickable ? "cursor-pointer hover:bg-slate-50 rounded-md -mx-2 px-2" : ""}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.color}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {item.subject && (
              <p className="truncate text-sm font-medium text-slate-800">{item.subject}</p>
            )}
            {item.body && (
              <p className="text-sm text-slate-600 whitespace-pre-line">{item.body}</p>
            )}
            {item.sentTo && (
              <p className="text-xs text-slate-400">To: {item.sentTo}</p>
            )}
            {item.amountCents != null && (
              <p className={`text-sm font-medium ${item.amountCents < 0 ? "text-green-600" : "text-slate-700"}`}>
                {item.amountCents < 0 ? "−" : ""}{formatCurrency(Math.abs(item.amountCents))}
                {item.status && (
                  <span className="ml-2 text-xs font-normal capitalize text-slate-400">
                    {item.status}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-slate-500">{formatDate(item.occurredAt)}</p>
            <p className="text-[10px] text-slate-400">{formatTime(item.occurredAt)}</p>
          </div>
        </div>
        {item.createdByName && (
          <p className="mt-0.5 text-[11px] text-slate-400">{item.createdByName}</p>
        )}
      </div>
    </div>
  );
}

interface Props {
  clientId: string;
  onTicketClick?: (ticketId: string) => void;
}

export function ActivityTimeline({ clientId, onTicketClick }: Props) {
  const { data: activity, isLoading } = useClientActivity(clientId);
  const { mutateAsync: addNote, isPending } = useAddClientNote();
  const [noteText, setNoteText] = useState("");

  async function handleAddNote() {
    const body = noteText.trim();
    if (!body) return;
    try {
      await addNote({ clientId, body });
      setNoteText("");
    } catch {
      toast.error("Failed to add note");
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Add note */}
      <div className="border-b p-4">
        <Textarea
          placeholder="Add a note…"
          className="min-h-[60px] resize-none text-sm"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
          }}
        />
        {noteText.trim() && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={handleAddNote} disabled={isPending}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              {isPending ? "Saving…" : "Add Note"}
            </Button>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <div className="space-y-4 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (activity ?? []).length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">
            No activity yet
          </div>
        ) : (
          <div className="divide-y">
            {(activity ?? []).map((item) => (
              <ActivityRow key={item.id} item={item} onTicketClick={onTicketClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
