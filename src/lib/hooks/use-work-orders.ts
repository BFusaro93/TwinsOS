import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapWorkOrder } from "@/lib/supabase/mappers";
import type { WorkOrder, WorkOrderStatus } from "@/types/cmms";

function patchWOCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<WorkOrder>) {
  queryClient.setQueryData<WorkOrder[]>(["work-orders"], (old) =>
    old?.map((wo) => wo.id === id ? { ...wo, ...patch } : wo) ?? []
  );
}

export function useWorkOrders() {
  return useQuery({
    queryKey: ["work-orders"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_orders").select("*").is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapWorkOrder);
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
    mutationFn: async (input: Omit<WorkOrder, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("work_orders").insert({
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
        due_date: input.dueDate,
        category: input.category,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        categories: (input.categories ?? []) as any,
        work_order_number: input.workOrderNumber,
        parent_work_order_id: input.parentWorkOrderId,
        pm_schedule_id: input.pmScheduleId,
        is_recurring: input.isRecurring,
        recurrence_frequency: input.recurrenceFrequency,
        automation_id: input.automationId ?? null,
      }).select().single();
      if (error) throw error;
      return mapWorkOrder(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
  });
}

export function useUpdateWorkOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      automationId,
    }: {
      id: string;
      status: WorkOrderStatus;
      automationId?: string | null;
    }) => {
      const supabase = createClient();
      const { error } = await supabase.from("work_orders").update({ status }).eq("id", id);
      if (error) throw error;

      // When completing a WO that was triggered by an automation, advance the threshold
      if (status === "done" && automationId) {
        const { data: auto } = await supabase
          .from("automations")
          .select("*")
          .eq("id", automationId)
          .single();

        if (auto && auto.trigger_type === "meter_threshold") {
          const tc = (auto.trigger_config ?? {}) as Record<string, unknown>;
          const interval = tc.interval != null ? Number(tc.interval) : null;
          // Use last_fired_value as the base; fall back to current threshold so
          // the advancement is always correct even if last_fired_value was cleared.
          const baseValue = auto.last_fired_value != null
            ? Number(auto.last_fired_value)
            : Number(tc.threshold ?? 0);

          if (interval != null) {
            const newThreshold = baseValue + interval;
            await supabase
              .from("automations")
              .update({
                trigger_config: { ...tc, threshold: newThreshold },
                pending_reset: false,
                last_fired_at: null,
                last_fired_value: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", automationId);
          } else {
            await supabase
              .from("automations")
              .update({
                pending_reset: false,
                updated_at: new Date().toISOString(),
              })
              .eq("id", automationId);
          }
        }
      }
    },
    onSuccess: (_, { id, status }) => {
      if (status) patchWOCache(queryClient, id, { status });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["audit-log", "work_order", id] });
      queryClient.invalidateQueries({ queryKey: ["automations"] });
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
        ...(input.dueDate !== undefined && { due_date: input.dueDate }),
        ...(input.category !== undefined && { category: input.category }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(input.categories !== undefined && { categories: input.categories as any }),
        ...(input.woType !== undefined && { wo_type: input.woType }),
        ...(input.assetId !== undefined && { asset_id: input.assetId }),
        ...(input.assetName !== undefined && { asset_name: input.assetName }),
        ...(input.linkedEntityType !== undefined && { linked_entity_type: input.linkedEntityType }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapWorkOrder(data);
    },
    onSuccess: (data, { id }) => {
      if (data) patchWOCache(queryClient, id, data);
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders", id] });
      queryClient.invalidateQueries({ queryKey: ["audit-log", "work_order", id] });
    },
  });
}

const VALID_WO_STATUSES = new Set(["open", "on_hold", "in_progress", "done"]);
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
/** Parse M/D/YY or M/D/YY HH:MM date strings from QuickBooks CSV exports. */
function parseCsvDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  // M/D/YY HH:MM  (e.g. "4/9/26 14:09")
  const m1 = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})\s+(\d{1,2}):(\d{2})$/);
  if (m1) {
    const [, mo, dy, yr, hr, mn] = m1;
    return new Date(2000 + parseInt(yr), parseInt(mo) - 1, parseInt(dy), parseInt(hr), parseInt(mn)).toISOString().slice(0, 10);
  }
  // M/D/YY (date only)
  const m2 = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m2) {
    const [, mo, dy, yr] = m2;
    return new Date(2000 + parseInt(yr), parseInt(mo) - 1, parseInt(dy)).toISOString().slice(0, 10);
  }
  // M/D/YYYY or other long-year formats
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
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
        supabase.from("vehicles").select("id, name").is("deleted_at", null),
      ]);
      const assetMap = new Map((assets ?? []).map((a) => [a.name.toLowerCase(), a.id as string]));
      const vehicleMap = new Map((vehicles ?? []).map((v) => [v.name.toLowerCase(), v.id as string]));

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

export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("work_orders").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["work-orders"] }),
  });
}
