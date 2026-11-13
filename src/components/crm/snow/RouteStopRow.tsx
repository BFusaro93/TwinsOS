"use client";

import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITY_STYLE } from "@/lib/snow-route-display";

/** High / normal / low client priority (the three levels the dispatch board uses). */
export function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return (
    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium capitalize", PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.normal)}>
      {priority}
    </span>
  );
}

/** One ordered stop on the route: drag handle, editable position, details, move and remove. */
export function RouteStopRow({
  index,
  total,
  clientName,
  address,
  service,
  priority,
  canManage,
  busy,
  dragOver,
  onMove,
  onSetPosition,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  index: number;
  total: number;
  clientName: string;
  address: string;
  service: string;
  priority?: string | null;
  canManage: boolean;
  busy: boolean;
  dragOver: boolean;
  onMove: (direction: -1 | 1) => void;
  onSetPosition: (position: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}) {
  const [text, setText] = useState(String(index + 1));
  useEffect(() => setText(String(index + 1)), [index]);

  function commit() {
    const n = Number(text);
    if (Number.isFinite(n) && n >= 1 && Math.round(n) !== index + 1) onSetPosition(n);
    else setText(String(index + 1));
  }

  return (
    <div
      draggable={canManage}
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={cn("flex items-center gap-2 px-2 py-1.5 text-sm", dragOver && "bg-brand-50 dark:bg-neutral-800")}
    >
      {canManage && <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300 dark:text-neutral-600" aria-hidden />}
      {canManage ? (
        <input
          value={text}
          inputMode="numeric"
          aria-label={`Position of ${clientName}`}
          onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="h-7 w-10 rounded border bg-transparent text-center font-mono text-xs"
        />
      ) : (
        <span className="w-6 text-xs font-mono text-slate-400 dark:text-neutral-500">{index + 1}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-slate-700 dark:text-neutral-300">{clientName}</span>
          <PriorityBadge priority={priority} />
        </div>
        <p className="truncate text-xs text-slate-500 dark:text-neutral-400">{address || "No address"}{service ? ` · ${service}` : ""}</p>
      </div>
      {canManage && (
        <>
          <div className="flex flex-col">
            <button onClick={() => onMove(-1)} disabled={index === 0 || busy} aria-label="Move up" className="text-slate-300 hover:text-slate-600 disabled:opacity-30 dark:text-neutral-500 dark:hover:text-neutral-400">
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onMove(1)} disabled={index === total - 1 || busy} aria-label="Move down" className="text-slate-300 hover:text-slate-600 disabled:opacity-30 dark:text-neutral-500 dark:hover:text-neutral-400">
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
          <button onClick={onRemove} aria-label={`Remove ${clientName} from route`} className="text-slate-300 hover:text-red-500 dark:text-neutral-500 dark:hover:text-red-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
