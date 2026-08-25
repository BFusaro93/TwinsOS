"use client";

import { useState, useMemo, useEffect } from "react";
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
  MessageSquare,
  MessageSquarePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { usePOStore, useCMMSStore, useCurrentUserStore } from "@/stores";
import { useParts } from "@/lib/hooks/use-parts";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { usePMSchedules } from "@/lib/hooks/use-pm-schedules";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { useEstimates } from "@/lib/hooks/use-estimates";
import { useRequests } from "@/lib/hooks/use-requests";
import { useNotificationReads } from "@/lib/hooks/use-notification-reads";
import { useNotificationPrefs } from "@/lib/hooks/use-notification-prefs";
import { createClient } from "@/lib/supabase/client";
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
      return <Activity className={cn(cls, "text-blue-500")} />;
    case "wo_comment":
      return <MessageSquare className={cn(cls, "text-slate-400")} />;
    case "estimate_change_request":
      return <MessageSquarePlus className={cn(cls, "text-amber-500")} />;
    case "estimate_client_accepted":
      return <ThumbsUp className={cn(cls, "text-emerald-500")} />;
    case "estimate_client_rejected":
      return <ThumbsDown className={cn(cls, "text-red-500")} />;
    case "ticket_created":
    case "ticket_assigned":
      return <MessageSquarePlus className={cn(cls, "text-brand-500")} />;
    case "ticket_comment":
      return <MessageSquare className={cn(cls, "text-slate-400")} />;
    case "contract_expiring":
      return <CalendarClock className={cn(cls, "text-amber-500")} />;
    case "automation_alert":
      return <Bell className={cn(cls, "text-amber-500")} />;
    default:
      return <Bell className={cn(cls, "text-slate-400")} />;
  }
}

export function NotificationsBell() {
  const router = useRouter();
  const { setSelectedRequisitionId, setSelectedPOId } = usePOStore();
  const { setSelectedWorkOrderId, setSelectedPMScheduleId } = useCMMSStore();

  const { currentUser } = useCurrentUserStore();
  const { data: parts = [] } = useParts();
  const { data: workOrders = [] } = useWorkOrders();
  const { data: pmSchedules = [] } = usePMSchedules();
  const { data: requisitions = [] } = useRequisitions();
  const { data: purchaseOrders = [] } = usePurchaseOrders();
  const { data: estimates = [] } = useEstimates();
  const { data: maintenanceRequests = [] } = useRequests();
  const { data: notifPrefs } = useNotificationPrefs();

  // Fetch persisted notifications (wo_comment type) from the DB
  const [dbNotifications, setDbNotifications] = useState<Array<{
    id: string; type: string | null; title: string | null;
    message: string; entity_id: string | null; entity_type: string | null; created_at: string;
  }>>([]);

  useEffect(() => {
    if (!currentUser.id) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id, type, title, message, entity_id, entity_type, created_at")
      .eq("user_id", currentUser.id)
      .in("type", ["wo_comment", "wo_status_changed", "estimate_change_request", "estimate_client_accepted", "estimate_client_rejected", "ticket_created", "ticket_assigned", "ticket_comment", "contract_expiring", "automation_alert"])
      .order("created_at", { ascending: false })
      .limit(50)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => { if (data) setDbNotifications(data as any); });
  }, [currentUser.id]);

  const [open, setOpen] = useState(false);

  // Derive notification IDs first so we can pass them to the reads hook for pruning
  // (readIds is seeded from localStorage immediately, then merged with DB rows)
  const { readIds, markRead, markAllRead: markAllReadIds } = useNotificationReads(
    useMemo(() => {
      // We only need the IDs list for pruning — compute cheaply without full objects
      const todayIso = new Date().toISOString().slice(0, 10);
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const weekFromNowIso = weekFromNow.toISOString().slice(0, 10);
      return [
        ...(notifPrefs?.inAppApprovalRequired !== false ? requisitions.filter((r) => r.status === "pending_approval").map((r) => `req-approval-${r.id}`) : []),
        ...(notifPrefs?.inAppPoApprovalRequired !== false ? purchaseOrders.filter((po) => po.status === "pending").map((po) => `po-approval-${po.id}`) : []),
        ...(notifPrefs?.inAppEstimateApprovalRequired !== false ? estimates.filter((e) => e.approvalStatus === "pending").map((e) => `estimate-approval-${e.id}`) : []),
        ...(notifPrefs?.inAppWorkOrderOverdue !== false ? workOrders.filter((wo) => wo.status !== "done" && wo.dueDate !== null && wo.dueDate.slice(0, 10) < todayIso).map((wo) => `wo-overdue-${wo.id}`) : []),
        ...(notifPrefs?.inAppWorkOrderAssigned !== false ? workOrders.filter((wo) => wo.status !== "done" && (wo.assignedToIds ?? []).includes(currentUser.id)).map((wo) => `wo-assigned-${wo.id}`) : []),
        ...(notifPrefs?.inAppLowStockAlert !== false ? parts.filter((p) => p.deletedAt === null && p.minimumStock !== null && p.quantityOnHand <= p.minimumStock).map((p) => `low-stock-${p.id}`) : []),
        ...(notifPrefs?.inAppPmScheduleDue !== false ? pmSchedules.filter((pm) => pm.isActive && pm.nextDueDate.slice(0, 10) <= weekFromNowIso).map((pm) => `pm-due-${pm.id}`) : []),
        ...(notifPrefs?.inAppNewMaintenanceRequest !== false ? maintenanceRequests.filter((mr) => mr.status === "open").map((mr) => `maint-req-${mr.id}`) : []),
        ...dbNotifications.map((n) => `db-notif-${n.id}`),
      ];
    }, [requisitions, purchaseOrders, estimates, workOrders, parts, pmSchedules, maintenanceRequests, dbNotifications, currentUser.id, notifPrefs])
  );

  // Derive notifications from live data
  const notifications = useMemo<AppNotification[]>(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const weekFromNow = new Date();
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekFromNowIso = weekFromNow.toISOString().slice(0, 10);

    const items: AppNotification[] = [];

    // Pending-approval requisitions
    if (notifPrefs?.inAppApprovalRequired !== false) requisitions
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
    if (notifPrefs?.inAppPoApprovalRequired !== false) purchaseOrders
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

    // Pending-approval estimates
    if (notifPrefs?.inAppEstimateApprovalRequired !== false) estimates
      .filter((e) => e.approvalStatus === "pending")
      .forEach((e) => {
        const id = `estimate-approval-${e.id}`;
        items.push({
          id,
          type: "approval_required",
          title: "Estimate Approval Required",
          body: `Estimate #${e.estimateNumber} needs your approval${e.description ? ` — ${e.description}` : ""}.`,
          href: `/crm/estimates/${e.id}`,
          entityId: e.id,
          entityType: "estimate",
          createdAt: e.updatedAt,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // Work orders assigned to the current user
    if (notifPrefs?.inAppWorkOrderAssigned !== false) workOrders
      .filter((wo) => wo.status !== "done" && (wo.assignedToIds ?? []).includes(currentUser.id))
      .forEach((wo) => {
        const id = `wo-assigned-${wo.id}`;
        items.push({
          id,
          type: "wo_assigned",
          title: "Work Order Assigned",
          body: `${wo.workOrderNumber} — ${wo.title}${wo.assetName ? ` (${wo.assetName})` : ""}.`,
          href: "/cmms/work-orders",
          entityId: wo.id,
          entityType: "work_order",
          createdAt: wo.updatedAt,
          readAt: readIds.has(id) ? new Date().toISOString() : null,
        });
      });

    // Overdue work orders
    if (notifPrefs?.inAppWorkOrderOverdue !== false) workOrders
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

    // Low stock parts — skip if user has disabled in-app low stock alerts
    if (notifPrefs?.inAppLowStockAlert !== false) parts
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
    if (notifPrefs?.inAppPmScheduleDue !== false) pmSchedules
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

    // Persisted DB notifications — each of these is inserted directly into the
    // `notifications` table by server-side code (estimate-client-notify.ts,
    // ticket-notify.ts, estimate-change-requests.ts) rather than synthesized
    // client-side like the sections above.
    const DB_NOTIF_META: Record<string, { href: (entityId: string | null) => string; title: string }> = {
      estimate_change_request:    { href: (id) => `/crm/estimates/${id}`, title: "Change Requested" },
      estimate_client_accepted:   { href: (id) => `/crm/estimates/${id}`, title: "Estimate Accepted" },
      estimate_client_rejected:   { href: (id) => `/crm/estimates/${id}`, title: "Estimate Declined" },
      ticket_created:             { href: (id) => id ? `/crm/tickets?open=${id}` : "/crm/tickets", title: "New Ticket" },
      ticket_assigned:            { href: (id) => id ? `/crm/tickets?open=${id}` : "/crm/tickets", title: "Ticket Assigned" },
      ticket_comment:             { href: (id) => id ? `/crm/tickets?open=${id}` : "/crm/tickets", title: "New Comment" },
      contract_expiring:          { href: () => "/crm/accounting/contracts", title: "Contract Expiring Soon" },
      automation_alert:           { href: () => "/crm/communication/automations", title: "Automation Alert" },
      wo_status_changed:          { href: () => "/cmms/work-orders", title: "Status Changed" },
    };
    dbNotifications.filter((n) => {
      if (n.type === "wo_comment" && notifPrefs?.inAppWorkOrderComment === false) return false;
      if (n.type === "wo_status_changed" && notifPrefs?.inAppWorkOrderStatusChanged === false) return false;
      return true;
    }).forEach((n) => {
      const id = `db-notif-${n.id}`;
      const meta = n.type ? DB_NOTIF_META[n.type] : undefined;
      const notifType = (meta ? n.type : "wo_comment") as AppNotification["type"];
      const href = meta ? meta.href(n.entity_id) : "/cmms/work-orders";
      const defaultTitle = meta ? meta.title : "New Comment";
      items.push({
        id,
        type: notifType,
        title: n.title ?? defaultTitle,
        body: n.message,
        href,
        entityId: n.entity_id,
        entityType: n.entity_type as AppNotification["entityType"],
        createdAt: n.created_at,
        readAt: readIds.has(id) ? new Date().toISOString() : null,
      });
    });

    // Open maintenance requests (admins and managers only)
    if ((currentUser.role === "admin" || currentUser.role === "manager") && notifPrefs?.inAppNewMaintenanceRequest !== false) {
      maintenanceRequests
        .filter((mr) => mr.status === "open")
        .forEach((mr) => {
          const id = `maint-req-${mr.id}`;
          items.push({
            id,
            type: "wo_assigned" as AppNotification["type"], // reuse icon; no dedicated mr type
            title: "New Maintenance Request",
            body: `${mr.requestNumber} — ${mr.title}${mr.assetName ? ` (${mr.assetName})` : ""}.`,
            href: "/cmms/work-orders",
            entityId: mr.id,
            entityType: null,
            createdAt: mr.createdAt,
            readAt: readIds.has(id) ? new Date().toISOString() : null,
          });
        });
    }

    // Sort unread first, then by most recent
    return items.sort((a, b) => {
      if ((a.readAt === null) !== (b.readAt === null)) {
        return a.readAt === null ? -1 : 1;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [parts, workOrders, pmSchedules, requisitions, purchaseOrders, estimates, maintenanceRequests, dbNotifications, currentUser, readIds, notifPrefs]);

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  function markAllRead() {
    markAllReadIds(notifications.map((n) => n.id));
  }

  function handleNotifClick(notif: AppNotification) {
    markRead(notif.id);
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
