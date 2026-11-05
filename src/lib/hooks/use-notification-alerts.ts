import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@/lib/hooks/use-query";

/**
 * Narrow queries behind NotificationsBell's derived alerts. The bell is in
 * TopBar on every page, so it fetches only the rows that produce an alert and
 * only the columns the alert text needs — not the full lists.
 *
 * Every key sits under its list's key (["work-orders", "notification-alerts", …])
 * so the list invalidations that mutations and useTableRealtime already fire
 * refresh the bell too. Nothing here writes into the list caches.
 */

const ALERTS = "notification-alerts";

/**
 * Entities of one type whose ACTIVE approval step (the lowest pending "order"
 * in the live chain) includes `userId` as an approver — the only records the
 * bell may call "needs your approval". The whole pending list used to alert
 * every user, the submitter and viewers included.
 */
async function fetchMyActiveApprovalIds(
  supabase: ReturnType<typeof createClient>,
  entityType: "requisition" | "purchase_order" | "crm_estimate",
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("approval_requests")
    .select("entity_id, order, approver_id")
    .eq("entity_type", entityType)
    .eq("status", "pending")
    .eq("archived", false);
  if (error) throw error;
  const minOrder = new Map<string, number>();
  for (const r of data) {
    const cur = minOrder.get(r.entity_id);
    if (cur === undefined || r.order < cur) minOrder.set(r.entity_id, r.order);
  }
  const mine = new Set<string>();
  for (const r of data) {
    if (r.approver_id === userId && r.order === minOrder.get(r.entity_id)) mine.add(r.entity_id);
  }
  return [...mine];
}

export interface RequisitionAlertRow {
  id: string;
  requisitionNumber: string;
  title: string;
  updatedAt: string;
}

export function usePendingRequisitionAlerts(enabled: boolean, userId: string) {
  return useQuery({
    queryKey: ["requisitions", ALERTS, userId],
    queryFn: async (): Promise<RequisitionAlertRow[]> => {
      const supabase = createClient();
      const ids = await fetchMyActiveApprovalIds(supabase, "requisition", userId);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("requisitions")
        .select("id, requisition_number, title, updated_at")
        .in("id", ids)
        .eq("status", "pending_approval")
        .is("deleted_at", null);
      if (error) throw error;
      return data.map((r) => ({
        id: r.id,
        requisitionNumber: r.requisition_number,
        title: r.title,
        updatedAt: r.updated_at,
      }));
    },
    enabled: enabled && !!userId,
  });
}

export interface POAlertRow {
  id: string;
  poNumber: string;
  vendorName: string;
  updatedAt: string;
}

export function usePendingPOAlerts(enabled: boolean, userId: string) {
  return useQuery({
    queryKey: ["purchase-orders", ALERTS, userId],
    queryFn: async (): Promise<POAlertRow[]> => {
      const supabase = createClient();
      const ids = await fetchMyActiveApprovalIds(supabase, "purchase_order", userId);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_name, updated_at")
        .in("id", ids)
        .eq("status", "pending")
        .is("deleted_at", null);
      if (error) throw error;
      return data.map((po) => ({
        id: po.id,
        poNumber: po.po_number,
        vendorName: po.vendor_name,
        updatedAt: po.updated_at,
      }));
    },
    enabled: enabled && !!userId,
  });
}

export interface EstimateAlertRow {
  id: string;
  estimateNumber: number;
  description: string;
  updatedAt: string;
}

export function usePendingEstimateAlerts(enabled: boolean, userId: string) {
  return useQuery({
    queryKey: ["estimates", ALERTS, userId],
    queryFn: async (): Promise<EstimateAlertRow[]> => {
      const supabase = createClient();
      const ids = await fetchMyActiveApprovalIds(supabase, "crm_estimate", userId);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("estimates")
        .select("id, estimate_number, description, updated_at")
        .in("id", ids)
        .eq("approval_status", "pending")
        .is("deleted_at", null);
      if (error) throw error;
      return data.map((e) => ({
        id: e.id,
        estimateNumber: e.estimate_number,
        description: e.description,
        updatedAt: e.updated_at,
      }));
    },
    enabled: enabled && !!userId,
  });
}

export interface WorkOrderAlertRow {
  id: string;
  workOrderNumber: string;
  title: string;
  assetName: string | null;
  dueDate: string | null;
  /** Assigned to the current user (via their crm_employees row). */
  assignedToMe: boolean;
  updatedAt: string;
}

/**
 * Open work orders that are overdue (due before `todayIso`) and/or assigned to
 * `userId` — one request for both alerts; the bell splits them back out.
 *
 * work_orders.assigned_to_ids holds crm_employees ids (the WO picker uses
 * useSelectableEmployees), not profile ids, so the user's employee rows are
 * looked up first. The profile id stays in the match for a few legacy rows.
 */
export function useWorkOrderAlerts({
  userId,
  todayIso,
  overdue,
  assigned,
}: {
  userId: string;
  todayIso: string;
  overdue: boolean;
  assigned: boolean;
}) {
  return useQuery({
    queryKey: ["work-orders", ALERTS, { userId, todayIso, overdue, assigned }],
    queryFn: async (): Promise<WorkOrderAlertRow[]> => {
      const supabase = createClient();
      let myAssigneeIds: string[] = [];
      if (assigned && userId) {
        // An Equipt-only login may not be able to read crm_employees; then only
        // the legacy profile-id match applies.
        const { data: employees } = await supabase
          .from("crm_employees")
          .select("id")
          .eq("user_id", userId)
          .is("deleted_at", null);
        myAssigneeIds = [userId, ...(employees ?? []).map((e) => e.id)];
      }
      const filters = [
        overdue && `due_date.lt.${todayIso}`,
        // assigned_to_ids is jsonb, so containment takes a JSON array, not {…}.
        ...myAssigneeIds.map((id) => `assigned_to_ids.cs.${JSON.stringify([id])}`),
      ].filter(Boolean);
      if (filters.length === 0) return [];
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, work_order_number, title, asset_name, due_date, assigned_to_ids, updated_at")
        .neq("status", "done")
        .is("deleted_at", null)
        .or(filters.join(","));
      if (error) throw error;
      const mine = new Set(myAssigneeIds);
      return data.map((wo) => {
        const assignedToIds = Array.isArray(wo.assigned_to_ids) ? (wo.assigned_to_ids as string[]) : [];
        return {
          id: wo.id,
          workOrderNumber: wo.work_order_number,
          title: wo.title,
          assetName: wo.asset_name,
          dueDate: wo.due_date,
          assignedToMe: assignedToIds.some((id) => mine.has(id)),
          updatedAt: wo.updated_at,
        };
      });
    },
    enabled: overdue || (assigned && !!userId),
  });
}

export interface LowStockPartAlertRow {
  id: string;
  name: string;
  partNumber: string;
  quantityOnHand: number;
  updatedAt: string;
}

export function useLowStockPartAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["parts", ALERTS],
    queryFn: async (): Promise<LowStockPartAlertRow[]> => {
      const supabase = createClient();
      // PostgREST can't compare two columns, so the quantity_on_hand <=
      // minimum_stock test runs here — but over five narrow columns, not
      // select("*").
      const { data, error } = await supabase
        .from("parts")
        .select("id, name, part_number, quantity_on_hand, minimum_stock, updated_at")
        .is("deleted_at", null);
      if (error) throw error;
      return data
        .filter((p) => p.quantity_on_hand <= p.minimum_stock)
        .map((p) => ({
          id: p.id,
          name: p.name,
          partNumber: p.part_number,
          quantityOnHand: p.quantity_on_hand,
          updatedAt: p.updated_at,
        }));
    },
    enabled,
  });
}

export interface PMDueAlertRow {
  id: string;
  title: string;
  assetName: string;
  nextDueDate: string;
}

/** Active PM schedules due on or before `throughIso` (overdue ones included). */
export function usePMDueAlerts(throughIso: string, enabled: boolean) {
  return useQuery({
    queryKey: ["pm-schedules", ALERTS, throughIso],
    queryFn: async (): Promise<PMDueAlertRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedules")
        .select("id, title, asset_name, next_due_date")
        .eq("is_active", true)
        .lte("next_due_date", throughIso)
        .is("deleted_at", null);
      if (error) throw error;
      // A paused schedule (off-season) owes nothing, so it doesn't nag.
      const { data: paused, error: pausedErr } = await supabase
        .from("v_pm_schedule_pause_state")
        .select("pm_schedule_id")
        .eq("paused_today", true);
      if (pausedErr) throw pausedErr;
      const pausedIds = new Set((paused ?? []).map((p) => p.pm_schedule_id));
      return data.filter((pm) => !pausedIds.has(pm.id)).map((pm) => ({
        id: pm.id,
        title: pm.title,
        assetName: pm.asset_name,
        nextDueDate: pm.next_due_date,
      }));
    },
    enabled,
  });
}

export interface MaintenanceRequestAlertRow {
  id: string;
  requestNumber: string;
  title: string;
  assetName: string | null;
  createdAt: string;
}

export function useOpenMaintenanceRequestAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["requests", ALERTS],
    queryFn: async (): Promise<MaintenanceRequestAlertRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("id, request_number, title, asset_name, created_at")
        .eq("status", "open")
        .is("deleted_at", null);
      if (error) throw error;
      return data.map((mr) => ({
        id: mr.id,
        requestNumber: mr.request_number,
        title: mr.title,
        assetName: mr.asset_name,
        createdAt: mr.created_at,
      }));
    },
    enabled,
  });
}
