import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { mapMaintenanceRequest } from "@/lib/supabase/mappers";
import type { MaintenanceRequestStatus, WorkOrderPriority } from "@/types/cmms";

export function useRequests() {
  return useQuery({
    queryKey: ["requests"],
    queryFn: async () => {
      const supabase = createClient();
      // Every page, not just the first: PostgREST caps a response at 1,000
      // rows, and a capped list silently hid the oldest requests.
      const data = await fetchAllRows<Parameters<typeof mapMaintenanceRequest>[0]>(() =>
        supabase
          .from("maintenance_requests")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      );
      return (data.map(mapMaintenanceRequest)) as import("@/types").MaintenanceRequest[];
    },
  });
}

export function useRequest(id: string | null) {
  return useQuery({
    queryKey: ["requests", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
      /** Optional override; defaults to the signed-in user's profile name. */
      requestedByName?: string;
      assetId?: string | null;
      assetName?: string;
      equipmentType?: string;
      repairCategory?: string;
      hasRepairTag?: boolean;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You need to be signed in to submit a request.");
      // Credit the request to whoever is signed in. (It used to take the first
      // name of the org's user list, so every request showed the same person.)
      let requestedByName = input.requestedByName?.trim() || "";
      if (!requestedByName) {
        const { data: me } = await supabase
          .from("profiles")
          .select("name, email")
          .eq("id", user.id)
          .maybeSingle();
        requestedByName = me?.name?.trim() || me?.email || user.email || "Unknown";
      }
      // Atomic per-org counter — the old `Date.now().slice(-5)` suffix repeated
      // every 100 seconds, so two requests could be handed the same number
      // (same as the public submit path, which already uses this RPC).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: requestNumber, error: numberErr } = await (supabase.rpc as any)("next_entity_number", {
        p_entity_type: "maintenance_request",
        p_prefix: "MR",
      });
      if (numberErr || typeof requestNumber !== "string") throw numberErr ?? new Error("Failed to generate request number");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("maintenance_requests")
        .insert({
          request_number: requestNumber,
          title: input.title,
          description: input.description,
          status: "open",
          priority: input.priority,
          asset_id: input.assetId ?? null,
          asset_name: input.assetName?.trim() || null,
          requested_by_id: user.id,
          requested_by_name: requestedByName,
          linked_work_order_id: null,
          linked_work_order_number: null,
          equipment_type: input.equipmentType?.trim() || null,
          repair_category: input.repairCategory?.trim() || null,
          has_repair_tag: input.hasRepairTag ?? null,
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
      // Fire any request_submitted automations (best-effort, same pattern as above)
      fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventTrigger: "request_submitted", assetId: mr.assetId ?? null, assetName: mr.assetName ?? null }),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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

/**
 * Moves a request from `from` to `status` — compare-and-set, so two people
 * acting on the same request (or a stale screen) can't silently overwrite
 * each other. A request already linked to a work order keeps its status.
 */
export function useUpdateRequestStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, from }: { id: string; status: MaintenanceRequestStatus; from: MaintenanceRequestStatus }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("maintenance_requests")
        .update({ status })
        .eq("id", id)
        .eq("status", from)
        .is("linked_work_order_id", null)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("This request changed — refresh and try again.");
      }
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      queryClient.invalidateQueries({ queryKey: ["requests", id] });
    },
  });
}

/**
 * Atomically claims a request for conversion: flips status to 'converted' only
 * if the row is still in the status we just read (compare-and-set). A second
 * concurrent conversion (double-click, two tabs) matches zero rows and throws,
 * so only one work order is ever created. Returns the status to restore if the
 * work-order creation then fails.
 */
export function useClaimRequestForConversion() {
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<{ previousStatus: MaintenanceRequestStatus }> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current, error: readErr } = await (supabase as any)
        .from("maintenance_requests")
        .select("status")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (readErr) throw readErr;
      if (current.status === "converted") {
        throw new Error("This request has already been converted to a work order.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: claimed, error } = await (supabase as any)
        .from("maintenance_requests")
        .update({ status: "converted" })
        .eq("id", id)
        .eq("status", current.status)
        .is("linked_work_order_id", null)
        .select("id");
      if (error) throw error;
      if (!claimed || claimed.length === 0) {
        throw new Error("This request was just changed or converted by someone else. Refresh and try again.");
      }
      return { previousStatus: current.status as MaintenanceRequestStatus };
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
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
