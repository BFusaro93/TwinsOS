"use client";

import { ArrowRight, Archive, ArchiveRestore, Plus, RefreshCw, TrendingUp, Truck, Package, Trash2 } from "lucide-react";
import { useAuditLog, useMultiRecordAuditLog } from "@/lib/hooks/use-audit-log";
import type { AuditAction, AuditRecordType, AuditEntry } from "@/types";

const ACTION_CONFIG: Record<
  AuditAction,
  { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  created: {
    label: "Created",
    color: "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400",
    Icon: Plus,
  },
  updated: {
    label: "Updated",
    color: "bg-muted text-slate-600 dark:text-neutral-400",
    Icon: RefreshCw,
  },
  status_changed: {
    label: "Status Changed",
    color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",
    Icon: RefreshCw,
  },
  qty_adjusted: {
    label: "Qty Adjusted",
    color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
    Icon: Package,
  },
  price_updated: {
    label: "Price Updated",
    color: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400",
    Icon: TrendingUp,
  },
  vendor_changed: {
    label: "Vendor Changed",
    color: "bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400",
    Icon: Truck,
  },
  image_uploaded: {
    label: "Image Uploaded",
    color: "bg-muted text-slate-600 dark:text-neutral-400",
    Icon: RefreshCw,
  },
  archived: {
    label: "Archived",
    color: "bg-muted text-slate-600 dark:text-neutral-400",
    Icon: Archive,
  },
  unarchived: {
    label: "Unarchived",
    color: "bg-muted text-slate-600 dark:text-neutral-400",
    Icon: ArchiveRestore,
  },
  deleted: {
    label: "Deleted",
    color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400",
    Icon: Trash2,
  },
};

/** Consistent user avatar — same palette as CommentsSection */
const AVATAR_COLORS = [
  "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400",
  "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-400",
  "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  "bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400",
  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const cfg = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG.updated;
  const { Icon } = cfg;
  const hasValueChange = entry.oldValue !== null || entry.newValue !== null;

  return (
    <li className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="mt-1 w-px flex-1 bg-muted" />
      </div>

      <div className="mb-4 flex-1 pt-0.5">
        {/* Action badge + description */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}
          >
            {cfg.label}
          </span>
          <span className="text-sm text-slate-700 dark:text-neutral-300">{entry.description}</span>
        </div>

        {/* Value change diff */}
        {hasValueChange && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {entry.oldValue && (
              <span className="rounded bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 font-mono text-red-600 dark:text-red-400 line-through">
                {entry.oldValue}
              </span>
            )}
            {entry.oldValue && entry.newValue && (
              <ArrowRight className="h-3 w-3 text-slate-400 dark:text-neutral-500" />
            )}
            {entry.newValue && (
              <span className="rounded bg-green-50 dark:bg-green-950/40 px-1.5 py-0.5 font-mono text-green-700 dark:text-green-400">
                {entry.newValue}
              </span>
            )}
          </div>
        )}

        {/* By + timestamp */}
        <div className="mt-1.5 flex items-center gap-2">
          <div
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${avatarColor(entry.changedByName)}`}
          >
            {initials(entry.changedByName)}
          </div>
          <span className="text-xs text-muted-foreground">
            {entry.changedByName} &middot; {formatDateTime(entry.createdAt)}
          </span>
        </div>
      </div>
    </li>
  );
}

interface AuditTrailTabProps {
  // Single-record mode — most callers (one record, one record_id space).
  recordType?: AuditRecordType;
  recordId?: string;
  // Multi-group mode — combines several (recordType, recordIds[]) groups
  // into one chronological feed, e.g. a job's own entries plus every one
  // of its visits' entries, which live under different record_ids.
  groups?: { recordType: AuditRecordType; recordIds: string[] }[];
}

export function AuditTrailTab({ recordType, recordId, groups }: AuditTrailTabProps) {
  // Rules of hooks: call both unconditionally: each disables itself
  // (`enabled: false`) when its own inputs are missing/empty.
  const single = useAuditLog(recordType ?? "job_visit", recordId ?? "");
  const multi = useMultiRecordAuditLog(groups ?? []);
  const { data: entries, isLoading } = groups ? multi : single;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-neutral-500">No audit history found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ul className="flex flex-col">
        {entries.map((e) => (
          <AuditRow key={e.id} entry={e} />
        ))}
      </ul>
    </div>
  );
}
