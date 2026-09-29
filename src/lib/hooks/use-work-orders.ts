import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapWorkOrder } from "@/lib/supabase/mappers";
import type { WorkOrder, WorkOrderStatus } from "@/types/cmms";
import { setWOPartStock } from "@/lib/inventory/part-stock";
import { syncPartQtyToProduct } from "@/lib/hooks/use-wo-costs";

function patchWOCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<WorkOrder>) {
  queryClient.setQueryData<WorkOrder[]>(["work-orders"], (old) =>
    old?.map((wo) => wo.id === id ? { ...wo, ...patch } : wo)
  );
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ["work-orders"],
    queryFn: async () => {
      const supabase = createClient();
      const pageSize = 1000;
      const rows: Parameters<typeof mapWorkOrder>[0][] = [];
      let from = 0;
      // PostgREST caps unbounded selects at ~1000 rows — page through
      // explicitly so orgs with >1000 work orders don't silently lose
      // their oldest records from every list that uses this hook.
      while (true) {
        const { data, error } = await supabase
          .from("work_orders").select("*").is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return (rows.map(mapWorkOrder)) as WorkOrder[];
    },
  });
}

export function useWorkOrder(id: string) {
  return useQuery({
    queryKey: ["work-orders", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_orders").select("*").eq("id", id).is("deleted_at", null).single();
      if (error) throw error;
      return mapWorkOrder(data);
    },
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<WorkOrder, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt" | "workOrderNumber" | "completedAt"> & { workOrderNumber?: string }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // Atomic per-org/year counter, not Date.now() — two concurrent creates
      // previously could silently produce the same number.
      let workOrderNumber = input.workOrderNumber;
      if (!workOrderNumber) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: generated, error: numErr } = await (supabase.rpc as any)("next_work_order_number");
        if (numErr || !generated) throw numErr ?? new Error("Failed to generate work order number");
        workOrderNumber = generated;
      }
      const { data, error } = await supabase.from("work_orders").insert({
        created_by: user?.id ?? null,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        wo_type: input.woType,
        asset_id: input.assetId,
        asset_name: input.assetName,
        linked_entity_type: input.linkedEntityType,
        assigned_to_id: input.assignedToId,
        assigned_to_name: input.assignedToName,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assigned_to_ids: (input.assignedToIds ?? []) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assigned_to_names: (input.assignedToNames ?? []) as any,
        start_date: input.startDate ?? null,
        due_date: input.dueDate,
        category: input.category,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categories: (input.categories ?? []) as any,
        work_order_number: workOrderNumber as string,
        parent_work_order_id: input.parentWorkOrderId,
        pm_schedule_id: input.pmScheduleId,
        is_recurring: input.isRecurring,
        recurrence_frequency: input.recurrenceFrequency,
        automation_id: input.automationId ?? null,
      }).select().single();
      if (error) throw error;
      return mapWorkOrder(data);
    },
    onSuccess: (wo) => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      // Fire emails: assigned users get wo_assigned; admins who opted in get wo_created (best-effort)
      fetch("/api/notifications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "wo_assigned", entityId: wo.id, entityType: "work_order" }),
      }).catch(() => {});
    },
  });
}

export function useUpdateWorkOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: WorkOrderStatus;
      /** Accepted for callers' convenience; meter-firing release is DB-side. */
      automationId?: string | null;
    }) => {
      const supabase = createClient();

      // Block completing a parent WO that still has open children
      if (status === "done") {
        const { data: openChildren } = await supabase
          .from("work_orders")
          .select("id")
          .eq("parent_work_order_id", id)
          .is("deleted_at", null)
          .not("status", "in", '("done","skipped")')
          .limit(1);
        if (openChildren && openChildren.length > 0) {
          throw new Error("All sub-work orders must be completed or skipped before closing this work order.");
        }
      }

      const { error } = await supabase.from("work_orders").update({ status }).eq("id", id);
      if (error) throw error;

      // Meter automations: the DB trigger trg_work_orders_release_meter_firing
      // (20260928130200) releases the rule's latest firing when its WO is
      // done/skipped (threshold advances) or deleted (re-arms), on every write
      // path — this hook used to do it client-side, only on done, which left
      // rules stuck forever after a skip, a rejected request or a deletion.
    },
    onSuccess: (_, { id, status }) => {
      if (status) patchWOCache(queryClient, id, { status });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["audit-log", "work_order", id] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
      queryClient.invalidateQueries({ queryKey: ["part-wo-history"] });
      // Fire WO-status-changed email + in-app notification to assigned users (best-effort)
      fetch("/api/notifications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "wo_status_changed", entityId: id, entityType: "work_order", extra: { newStatus: status } }),
      }).catch(() => {});
      // Fire any wo_status_change automations configured for this target status (best-effort)
      fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventTrigger: "wo_status_change", toStatus: status, workOrderId: id }),
      }).catch(() => {});
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<WorkOrder> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("work_orders").update({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.assignedToId !== undefined && { assigned_to_id: input.assignedToId }),
        ...(input.assignedToName !== undefined && { assigned_to_name: input.assignedToName }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(input.assignedToIds !== undefined && { assigned_to_ids: input.assignedToIds as any }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(input.assignedToNames !== undefined && { assigned_to_names: input.assignedToNames as any }),
        ...(input.startDate !== undefined && { start_date: input.startDate }),
        ...(input.dueDate !== undefined && { due_date: input.dueDate }),
        ...(input.category !== undefined && { category: input.category }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(input.categories !== undefined && { categories: input.categories as any }),
        ...(input.woType !== undefined && { wo_type: input.woType }),
        ...(input.assetId !== undefined && { asset_id: input.assetId }),
        ...(input.assetName !== undefined && { asset_name: input.assetName }),
        ...(input.linkedEntityType !== undefined && { linked_entity_type: input.linkedEntityType }),
        ...(input.isRecurring !== undefined && { is_recurring: input.isRecurring }),
        ...(input.recurrenceFrequency !== undefined && { recurrence_frequency: input.recurrenceFrequency }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapWorkOrder(data);
    },
    onSuccess: (data, { id, assignedToIds, assignedToId }) => {
      if (data) patchWOCache(queryClient, id, data);
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["audit-log", "work_order", id] });
      // Fire assignment email when assignees are changed on an existing WO (best-effort)
      if (assignedToIds !== undefined || assignedToId !== undefined) {
        fetch("/api/notifications/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "wo_assigned", entityId: id, entityType: "work_order" }),
        }).catch(() => {});
      }
    },
  });
}

const VALID_WO_STATUSES = new Set(["open", "on_hold", "in_progress", "done", "skipped"]);
const VALID_WO_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

function normaliseWOStatus(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
  return VALID_WO_STATUSES.has(s) ? s : "open";
}

function normaliseWOPriority(raw: string): string {
  const s = raw.trim().toLowerCase();
  return VALID_WO_PRIORITIES.has(s) ? s : "medium";
}

/**
 * Bulk-inserts work orders from a CSV import.
 * Rows missing `title` are silently skipped.
 */
/**
 * yyyy-mm-dd from components (no Date/timezone round-trip), or null when the
 * components aren't a real calendar date — "13/40/24" must drop that one
 * cell, not produce "2024-13-40" and fail the whole batch insert.
 */
function ymd(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1 || m < 1 || m > 12 || d < 1) return null;
  // Day 0 of the next month = last day of month m (handles leap years).
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parse M/D/YY or M/D/YY HH:MM date strings from QuickBooks CSV exports. */
function parseCsvDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  // M/D/YY HH:MM  (e.g. "4/9/26 14:09")
  const m1 = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (m1) {
    const [, mo, dy, yr, hr, mn] = m1;
    return ymd(2000 + parseInt(yr), parseInt(mo), parseInt(dy));
  }
  // M/D/YY (date only)
  const m2 = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) {
    const [, mo, dy, yr] = m2;
    return ymd(2000 + parseInt(yr), parseInt(mo), parseInt(dy));
  }
  // M/D/YYYY or other long-year formats
  const m3 = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) return ymd(parseInt(m3[3]), parseInt(m3[1]), parseInt(m3[2]));
  // ISO yyyy-mm-dd (with optional time): take the date part as written.
  const m4 = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m4) return ymd(parseInt(m4[1]), parseInt(m4[2]), parseInt(m4[3]));
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return null;
}

export function useBulkImportWorkOrders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const valid = rows.filter((r) => r.title?.trim());
      if (valid.length === 0) return 0;

      // Pre-fetch assets and vehicles to enable name-based auto-linking
      const [{ data: assets }, { data: vehicles }] = await Promise.all([
        supabase.from("assets").select("id, name").is("deleted_at", null),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("vehicles").select("id, name").is("deleted_at", null),
      ]);
      const assetMap = new Map((assets ?? []).map((a) => [a.name.toLowerCase(), a.id as string]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vehicleMap = new Map<string, string>((vehicles ?? []).map((v: any) => [v.name.toLowerCase() as string, v.id as string]));

      let count = 0;
      for (const r of valid) {
        const assetNameRaw = r.assetName?.trim() || null;
        const assetKey = assetNameRaw?.toLowerCase() ?? "";

        // Resolve FK: check assets first, then vehicles
        let assetId: string | null = null;
        let linkedEntityType: string | null = null;
        if (assetKey) {
          const aid = assetMap.get(assetKey);
          if (aid) { assetId = aid; linkedEntityType = "asset"; }
          else {
            const vid = vehicleMap.get(assetKey);
            if (vid) { assetId = vid; linkedEntityType = "vehicle"; }
          }
        }

        const parsedCreatedAt = parseCsvDate(r.createdAt ?? "");
        const row = {
          title: r.title.trim(),
          description: r.description?.trim() || null,
          status: normaliseWOStatus(r.status ?? ""),
          priority: normaliseWOPriority(r.priority ?? ""),
          wo_type: r.woType?.trim() || null,
          asset_id: assetId,
          asset_name: assetNameRaw,
          linked_entity_type: linkedEntityType,
          assigned_to_name: r.assignedToName?.trim() || null,
          due_date: parseCsvDate(r.dueDate ?? ""),
          category: r.category?.trim() || null,
          work_order_number: r.workOrderNumber?.trim() || `WO-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 5)}`,
          ...(parsedCreatedAt && { created_at: new Date(parsedCreatedAt).toISOString() }),
        };

        const { error } = await supabase.from("work_orders").insert(row);
        if (error?.code === "23505") {
          const { data: { user } } = await supabase.auth.getUser();
          const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user!.id).single();
          await supabase.from("work_orders").update({
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            wo_type: row.wo_type,
            asset_id: row.asset_id,
            asset_name: row.asset_name,
            linked_entity_type: row.linked_entity_type,
            assigned_to_name: row.assigned_to_name,
            due_date: row.due_date,
            category: row.category,
          }).eq("work_order_number", row.work_order_number).eq("org_id", profile!.org_id).is("deleted_at", null);
        } else if (error) {
          throw error;
        }
        count++;
      }
      return count;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
  });
}

/** Returns all direct children of the given parent WO id. */
export function useSubWorkOrders(parentWorkOrderId: string | null) {
  return useQuery({
    queryKey: ["work-orders", "sub", parentWorkOrderId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .eq("parent_work_order_id", parentWorkOrderId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data.map(mapWorkOrder)) as WorkOrder[];
    },
    enabled: !!parentWorkOrderId,
  });
}

export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();

      // The dialog says the delete can't be undone, so sub-WOs (PM batches,
      // split jobs) go with their parent rather than being left orphaned
      // under a parent nobody can open. Collect the whole tree first.
      const ids: string[] = [id];
      for (let frontier = [id]; frontier.length > 0; ) {
        const { data: children, error: childErr } = await supabase
          .from("work_orders")
          .select("id")
          .in("parent_work_order_id", frontier)
          .is("deleted_at", null);
        if (childErr) throw childErr;
        frontier = (children ?? []).map((c) => c.id as string).filter((cid) => !ids.includes(cid));
        ids.push(...frontier);
      }

      // Parts used on these WOs go back to stock — only what each line
      // actually deducted (set_wo_part_stock), same as removing the line.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: woParts, error: partsErr } = await (supabase as any)
        .from("wo_parts")
        .select("id, part_id")
        .in("work_order_id", ids)
        .is("deleted_at", null)
        .not("part_id", "is", null);
      if (partsErr) throw partsErr;
      const touchedParts = new Set<string>();
      for (const wp of (woParts ?? []) as { id: string; part_id: string }[]) {
        await setWOPartStock(supabase, wp.id, 0);
        touchedParts.add(wp.part_id);
      }
      for (const partId of touchedParts) {
        await syncPartQtyToProduct(supabase, partId);
      }

      const now = new Date().toISOString();
      // Children first, so a failure part-way never leaves a live child
      // under a deleted parent.
      const childIds = ids.filter((wid) => wid !== id);
      if (childIds.length > 0) {
        const { error: childDelErr } = await supabase
          .from("work_orders")
          .update({ deleted_at: now })
          .in("id", childIds);
        if (childDelErr) throw childDelErr;
      }
      const { error } = await supabase.from("work_orders").update({ deleted_at: now }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["wo-parts"] });
      queryClient.invalidateQueries({ queryKey: ["parts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
