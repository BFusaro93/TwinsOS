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
    mutationFn: async ({ id, status }: { id: string; status: WorkOrderStatus }) => {
      const supabase = createClient();
      const { error } = await supabase.from("work_orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, status }) => {
      if (status) patchWOCache(queryClient, id, { status });
      queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      queryClient.invalidateQueries({ queryKey: ["work-orders", id] });
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
