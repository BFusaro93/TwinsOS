"use client";

import { X, Bell, Mail, GitBranch, StickyNote, MessageSquare, Tag, RefreshCw, Clock, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CRMSequenceEvent, EventType } from "@/types/crm-automations";

interface Props {
  event: CRMSequenceEvent;
  onClick: () => void;
  onDelete: () => void;
}

const EVENT_META: Record<
  EventType,
  { label: string; icon: React.ElementType; color: string }
> = {
  wait: { label: "Wait", icon: Clock, color: "border-slate-400" },
  email: { label: "Email", icon: Mail, color: "border-blue-500" },
  alert: { label: "Alert", icon: Bell, color: "border-amber-500" },
  ticket: { label: "Ticket", icon: Tag, color: "border-purple-500" },
  text_message: { label: "Text Message", icon: MessageSquare, color: "border-green-500" },
  if_branch: { label: "IF Branch", icon: GitBranch, color: "border-orange-500" },
  note: { label: "Note", icon: StickyNote, color: "border-gray-400" },
  update: { label: "Update", icon: RefreshCw, color: "border-cyan-500" },
  tags: { label: "Tags", icon: Hash, color: "border-pink-500" },
};

function getConfigSummary(event: CRMSequenceEvent): string {
  const c = event.config;
  switch (event.eventType) {
    case "wait":
      return [
        c.days ? `${c.days}d` : null,
        c.hours ? `${c.hours}h` : null,
        c.minutes ? `${c.minutes}m` : null,
      ]
        .filter(Boolean)
        .join(" ") || "No delay set";
    case "email":
      return c.subject ? `Subject: ${c.subject}` : "No subject set";
    case "alert":
      return c.message ? c.message.slice(0, 50) : "No message set";
    case "ticket":
      return c.title ? c.title : "No title set";
    case "text_message":
      return c.message ? c.message.slice(0, 50) : "No message set";
    case "note":
      return c.content ? c.content.slice(0, 50) : "No content set";
    case "update":
      return c.field ? `${c.field} → ${c.value}` : "No field set";
    case "tags":
      return [
        c.add_tags?.length ? `+${c.add_tags.join(", ")}` : null,
        c.remove_tags?.length ? `-${c.remove_tags.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" | ") || "No tags set";
    case "if_branch":
      return c.conditions?.length ? `${c.conditions.length} condition(s)` : "No conditions";
    default:
      return "";
  }
}

export function EventCard({ event, onClick, onDelete }: Props) {
  const meta = EVENT_META[event.eventType];
  const Icon = meta.icon;
  const summary = getConfigSummary(event);

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative flex cursor-pointer items-start gap-2 rounded-md border-l-4 border border-slate-200 p-3 bg-white hover:shadow-sm transition-shadow select-none",
        meta.color
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-700">{meta.label}</p>
        <p className="mt-0.5 truncate text-[11px] text-slate-400">{summary}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            event.isActive ? "bg-green-400" : "bg-slate-300"
          )}
          title={event.isActive ? "Active" : "Inactive"}
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-slate-300 hover:text-red-500 transition-colors"
          title="Delete event"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
