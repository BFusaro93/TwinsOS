import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapMaintenanceRequest } from "@/lib/supabase/mappers";
import type { MaintenanceRequestStatus, WorkOrderPriority } from "@/types/cmms";

export function useRequests() {
  return useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data.map(mapMaintenanceRequest);
    },
  });
}

export function useRequest(id: string | null) {
  return useQuery({
    queryKey: ["requests", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .select("*")
        .eq("id", id!)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapMaintenanceRequest(data);
    },
    enabled: !!id,
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description: string;
      priority: WorkOrderPriority;
      requestedByName: string;
      assetId?: string | null;
      assetName?: string;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const requestNumber = `MR-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`;
      const { data, error } = await supabase
        .from("maintenance_requests")
        .insert({
          request_number: requestNumber,
          title: input.title,
          description: input.description,
          status: "open",
          priority: input.priority,
          asset_id: input.assetId ?? null,
          asset_name: input.assetName?.trim() || null,
          requested_by_id: user?.id ?? null,
          requested_by_name: input.requestedByName,
          linked_work_order_id: null,
          linked_work_order_number: null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapMaintenanceRequest(data);
    },
    onSuccess: (mr) => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      // Notify admins/managers about new maintenance request (best-effort)
      fetch("/api/notifications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "new_maintenance_request", entityId: mr.id, entityType: "maintenance_request" }),
      }).catch(() => {});
    },
  });
}

export function useUpdateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      title: string;
      description: string;
      priority: WorkOrderPriority;
      assetId?: string | null;
      assetName?: string | null;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("maintenance_requests")
        .update({
          title: input.title,
          description: input.description,
          priority: input.priority,
          asset_id: input.assetId ?? null,
          asset_name: input.assetName ?? null,
        })
        .eq("id", input.id)
        .select()
        .single();
      if (error) throw error;
      return mapMaintenanceRequest(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["requests", id] });
    },
  });
}

export function useUpdateRequestStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MaintenanceRequestStatus }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("maintenance_requests")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["requests", id] });
    },
  });
}

export function useConvertRequestToWO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      linkedWorkOrderId,
      linkedWorkOrderNumber,
    }: {
      id: string;
      linkedWorkOrderId: string;
      linkedWorkOrderNumber: string;
    }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("maintenance_requests")
        .update({
          status: "converted",
          linked_work_order_id: linkedWorkOrderId,
          linked_work_order_number: linkedWorkOrderNumber,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["requests", id] });
    },
  });
}

export function useDeleteRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("maintenance_requests")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
  });
}
