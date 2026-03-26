"use client";

import { ArrowRight, Plus, RefreshCw, TrendingUp, Truck, Package, Trash2 } from "lucide-react";
import { useAuditLog } from "@/lib/hooks/use-audit-log";
import type { AuditAction, AuditRecordType, AuditEntry } from "@/types";

const ACTION_CONFIG: Record<
  AuditAction,
  { label: string; color: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  created: {
    label: "Created",
    color: "bg-brand-100 text-brand-700",
    Icon: Plus,
  },
  updated: {
    label: "Updated",
    color: "bg-slate-100 text-slate-600",
    Icon: RefreshCw,
  },
  status_changed: {
    label: "Status Changed",
    color: "bg-blue-100 text-blue-700",
    Icon: RefreshCw,
  },
  qty_adjusted: {
    label: "Qty Adjusted",
    color: "bg-amber-100 text-amber-700",
    Icon: Package,
  },
  price_updated: {
    label: "Price Updated",
    color: "bg-purple-100 text-purple-700",
    Icon: TrendingUp,
  },
  vendor_changed: {
    label: "Vendor Changed",
    color: "bg-teal-100 text-teal-700",
    Icon: Truck,
  },
  image_uploaded: {
    label: "Image Uploaded",
    color: "bg-slate-100 text-slate-600",
    Icon: RefreshCw,
  },
  deleted: {
    label: "Deleted",
    color: "bg-red-100 text-red-700",
    Icon: Trash2,
  },
};

/** Consistent user avatar — same palette as CommentsSection */
const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
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
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100">
          <Icon className="h-3.5 w-3.5 text-slate-500" />
        </div>
        <div className="mt-1 w-px flex-1 bg-slate-100" />
      </div>

      <div className="mb-4 flex-1 pt-0.5">
        {/* Action badge + description */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}
          >
            {cfg.label}
          </span>
          <span className="text-sm text-slate-700">{entry.description}</span>
        </div>

        {/* Value change diff */}
        {hasValueChange && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            {entry.oldValue && (
              <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-red-600 line-through">
                {entry.oldValue}
              </span>
            )}
            {entry.oldValue && entry.newValue && (
              <ArrowRight className="h-3 w-3 text-slate-400" />
            )}
            {entry.newValue && (
              <span className="rounded bg-green-50 px-1.5 py-0.5 font-mono text-green-700">
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
          <span className="text-xs text-slate-500">
            {entry.changedByName} &middot; {formatDateTime(entry.createdAt)}
          </span>
        </div>
      </div>
    </li>
  );
}

interface AuditTrailTabProps {
  recordType: AuditRecordType;
  recordId: string;
}

export function AuditTrailTab({ recordType, recordId }: AuditTrailTabProps) {
  const { data: entries, isLoading } = useAuditLog(recordType, recordId);

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
        <p className="text-sm text-slate-400">No audit history found.</p>
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
