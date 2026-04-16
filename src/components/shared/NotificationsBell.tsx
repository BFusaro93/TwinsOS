"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  Wrench,
  AlertTriangle,
  Package,
  CalendarClock,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePOStore, useCMMSStore } from "@/stores";
import { useParts } from "@/lib/hooks/use-parts";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { usePMSchedules } from "@/lib/hooks/use-pm-schedules";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import type { AppNotification } from "@/types/notification";

function timeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function NotifIcon({ type }: { type: AppNotification["type"] }) {
  const cls = "h-4 w-4 shrink-0";
  switch (type) {
    case "approval_required":
      return <ShieldCheck className={cn(cls, "text-amber-500")} />;
    case "approved":
      return <ThumbsUp className={cn(cls, "text-emerald-500")} />;
    case "rejected":
      return <ThumbsDown className={cn(cls, "text-red-500")} />;
    case "wo_assigned":
      return <Wrench className={cn(cls, "text-brand-500")} />;
    case "wo_overdue":
      return <AlertTriangle className={cn(cls, "text-red-500")} />;
    case "low_stock":
      return <Package className={cn(cls, "text-amber-500")} />;
    case "pm_due":
      return <CalendarClock className={cn(cls, "text-violet-500")} />;
    case "wo_status_changed":
      return <Activity className={cn(cls, "text-slate-400")} />;
    default:
      return <Bell className={cn(cls, "text-slate-400")} />;
  }
}

export function NotificationsBell() {
  const router = useRouter();
  const { setSelectedRequisitionId, setSelectedPOId } = usePOStore();
  const { setSelectedWorkOrderId, setSelectedPMScheduleId } = useCMMSStore();

  const { data: parts = [] } = useParts();
  const { data: workOrders = [] } = useWorkOrders();
  const { data: pmSchedules = [] } = usePMSchedules();
  const { data: requisitions = [] } = useRequisitions();
  const { data: purchaseOrders = [] } = usePurchaseOrders();

  const [open, setOpen] = useState(false);

  // Persist read notification IDs to localStorage so they survive page refreshes.
  const [readIds, setReadIdsState] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const stored = localStorage.getItem("notif_read_ids");
      return stored ? new Set<string>(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const setReadIds = useCallback((updater: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    setReadIdsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem("notif_read_ids", JSON.stringify([...next]));
      } catch {
        // storage quota exceeded — non-fatal
      }
      return next;
    });
  }, []);

  // Derive notifications from live data
  const notifications = useMemo<AppNotification[]>(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekFromNowIso = weekFromNow.toISOString().slice(0, 10);

    const items: AppNotification[] = [];

    // Pending-approval requisitions
    requisitions
      .filter((r) => r.status === "pending_approval")
      .forEach((r) => {
        const id = `req-approval-${r.id}`;
        items.push({
          id,
          type: "approval_required",
          title: "Approval Required",
          body: `${r.requisitionNumber} needs your approval — ${r.title}.`,
          href: "/po/requisitions",
          entityId: r.id,
          entityType: "requisition",
          createdAt: r.updatedAt,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // Pending-approval purchase orders
    purchaseOrders
      .filter((po) => po.status === "pending")
      .forEach((po) => {
        const id = `po-approval-${po.id}`;
        items.push({
          id,
          type: "approval_required",
          title: "PO Approval Required",
          body: `${po.poNumber} needs your approval${po.vendorName ? ` — ${po.vendorName}` : ""}.`,
          href: "/po/orders",
          entityId: po.id,
          entityType: "purchase_order",
          createdAt: po.updatedAt,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // Overdue work orders
    workOrders
      .filter(
        (wo) =>
          wo.status !== "done" &&
          wo.dueDate !== null &&
          wo.dueDate.slice(0, 10) < todayIso
      )
      .forEach((wo) => {
        const id = `wo-overdue-${wo.id}`;
        items.push({
          id,
          type: "wo_overdue",
          title: "Work Order Overdue",
          body: `${wo.workOrderNumber} is overdue — ${wo.title}.`,
          href: "/cmms/work-orders",
          entityId: wo.id,
          entityType: "work_order",
          createdAt: wo.dueDate!,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // Low stock parts
    parts
      .filter(
        (p) =>
          p.deletedAt === null &&
          p.minimumStock !== null &&
          p.quantityOnHand <= p.minimumStock
      )
      .forEach((p) => {
        const id = `low-stock-${p.id}`;
        items.push({
          id,
          type: "low_stock",
          title: "Low Stock Alert",
          body: `${p.name} (${p.partNumber}) is below reorder point — ${p.quantityOnHand} unit${p.quantityOnHand !== 1 ? "s" : ""} remaining.`,
          href: "/cmms/parts",
          entityId: p.id,
          entityType: "part",
          createdAt: p.updatedAt,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // PM schedules due within 7 days
    pmSchedules
      .filter(
        (pm) =>
          pm.isActive &&
          pm.nextDueDate.slice(0, 10) <= weekFromNowIso
      )
      .forEach((pm) => {
        const id = `pm-due-${pm.id}`;
        const overdue = pm.nextDueDate.slice(0, 10) < todayIso;
        items.push({
          id,
          type: "pm_due",
          title: overdue ? "PM Schedule Overdue" : "PM Schedule Due Soon",
          body: `${pm.title} — ${pm.assetName}${overdue ? " (overdue)" : " is due within 7 days"}.`,
          href: "/cmms/pm-schedules",
          entityId: pm.id,
          entityType: "pm_schedule",
          createdAt: pm.nextDueDate,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // Sort unread first, then by most recent
    return items.sort((a, b) => {
      if ((a.readAt === null) !== (b.readAt === null)) {
        return a.readAt === null ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [parts, workOrders, pmSchedules, requisitions, purchaseOrders, readIds]);

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  function markAllRead() {
    setReadIds(new Set(notifications.map((n) => n.id)));
  }

  // Prune stale IDs monthly to keep localStorage clean (notifications naturally
  // disappear when their underlying data resolves, but IDs could accumulate).
  useEffect(() => {
    const PRUNE_KEY = "notif_pruned_at";
    const lastPruned = localStorage.getItem(PRUNE_KEY);
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (!lastPruned || Number(lastPruned) < monthAgo) {
      const activeIds = new Set(notifications.map((n) => n.id));
      setReadIds((prev) => new Set([...prev].filter((id) => activeIds.has(id))));
      localStorage.setItem(PRUNE_KEY, String(Date.now()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNotifClick(notif: AppNotification) {
    setReadIds((prev) => new Set([...prev, notif.id]));
    setOpen(false);

    if (notif.entityId) {
      switch (notif.entityType) {
        case "requisition":
          setSelectedRequisitionId(notif.entityId);
          break;
        case "purchase_order":
          setSelectedPOId(notif.entityId);
          break;
        case "work_order":
          setSelectedWorkOrderId(notif.entityId);
          break;
        case "pm_schedule":
          setSelectedPMScheduleId(notif.entityId);
          break;
        case "part":
          router.push(`${notif.href}?open=${notif.entityId}`);
          return;
      }
    }

    router.push(notif.href);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0 text-slate-500">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[420px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
              <Bell className="h-8 w-8 opacity-30" />
              <p className="text-sm">No notifications</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                type="button"
                onClick={() => handleNotifClick(notif)}
                className={cn(
                  "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50",
                  notif.readAt === null && "bg-brand-50 hover:bg-brand-50/80"
                )}
              >
                <div className="mt-0.5">
                  <NotifIcon type={notif.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      notif.readAt === null
                        ? "font-semibold text-slate-900"
                        : "font-medium text-slate-700"
                    )}
                  >
                    {notif.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 line-clamp-2">
                    {notif.body}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{timeAgo(notif.createdAt)}</p>
                </div>
                {notif.readAt === null && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                )}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
