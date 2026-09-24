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

export interface RequisitionAlertRow {
  id: string;
  requisitionNumber: string;
  title: string;
  updatedAt: string;
}

export function usePendingRequisitionAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["requisitions", ALERTS],
    queryFn: async (): Promise<RequisitionAlertRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("requisitions")
        .select("id, requisition_number, title, updated_at")
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
    enabled,
  });
}

export interface POAlertRow {
  id: string;
  poNumber: string;
  vendorName: string;
  updatedAt: string;
}

export function usePendingPOAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["purchase-orders", ALERTS],
    queryFn: async (): Promise<POAlertRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, vendor_name, updated_at")
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
    enabled,
  });
}

export interface EstimateAlertRow {
  id: string;
  estimateNumber: number;
  description: string;
  updatedAt: string;
}

export function usePendingEstimateAlerts(enabled: boolean) {
  return useQuery({
    queryKey: ["estimates", ALERTS],
    queryFn: async (): Promise<EstimateAlertRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("estimates")
        .select("id, estimate_number, description, updated_at")
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
    enabled,
  });
}

export interface WorkOrderAlertRow {
  id: string;
  workOrderNumber: string;
  title: string;
  assetName: string | null;
  dueDate: string | null;
  assignedToIds: string[];
  updatedAt: string;
}

/**
 * Open work orders that are overdue (due before `todayIso`) and/or assigned to
 * `userId` — one request for both alerts; the bell splits them back out.
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
  const filters = [
    overdue && `due_date.lt.${todayIso}`,
    // assigned_to_ids is jsonb, so containment takes a JSON array, not {…}.
    assigned && userId && `assigned_to_ids.cs.${JSON.stringify([userId])}`,
  ].filter(Boolean);
  return useQuery({
    queryKey: ["work-orders", ALERTS, { userId, todayIso, overdue, assigned }],
    queryFn: async (): Promise<WorkOrderAlertRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, work_order_number, title, asset_name, due_date, assigned_to_ids, updated_at")
        .neq("status", "done")
        .is("deleted_at", null)
        .or(filters.join(","));
      if (error) throw error;
      return data.map((wo) => ({
        id: wo.id,
        workOrderNumber: wo.work_order_number,
        title: wo.title,
        assetName: wo.asset_name,
        dueDate: wo.due_date,
        assignedToIds: Array.isArray(wo.assigned_to_ids) ? (wo.assigned_to_ids as string[]) : [],
        updatedAt: wo.updated_at,
      }));
    },
    enabled: filters.length > 0,
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
      return data.map((pm) => ({
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
