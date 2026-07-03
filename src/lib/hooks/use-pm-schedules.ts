import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapPMSchedule } from "@/lib/supabase/mappers";
import type { PMSchedule } from "@/types/cmms";

export function usePMSchedules() {
  return useQuery({
    queryKey: ["pm-schedules"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedules").select("*").is("deleted_at", null)
        .order("title");
      if (error) throw error;
      return (data.map(mapPMSchedule)) as PMSchedule[];
    },
  });
}

export function usePMSchedule(id: string) {
  return useQuery({
    queryKey: ["pm-schedules", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("pm_schedules").select("*").eq("id", id).is("deleted_at", null).single();
      if (error) throw error;
      return mapPMSchedule(data);
    },
    enabled: !!id,
  });
}

export function useCreatePMSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<PMSchedule, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("pm_schedules").insert({
        created_by: user?.id ?? null,
        title: input.title,
        asset_id: input.assetId,
        asset_name: input.assetName,
        frequency: input.frequency,
        next_due_date: input.nextDueDate,
        last_completed_date: input.lastCompletedDate,
        is_active: input.isActive,
        description: input.description,
        assigned_to_id: input.assignedToId ?? null,
        assigned_to_name: input.assignedToName ?? null,
      }).select().single();
      if (error) throw error;
      return mapPMSchedule(data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pm-schedules"] }),
    onError: (err) => console.error("[useCreatePMSchedule]", err),
  });
}

export function useUpdatePMSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<PMSchedule> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("pm_schedules").update({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.assetId !== undefined && { asset_id: input.assetId }),
        ...(input.assetName !== undefined && { asset_name: input.assetName }),
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.nextDueDate !== undefined && { next_due_date: input.nextDueDate }),
        ...(input.lastCompletedDate !== undefined && { last_completed_date: input.lastCompletedDate }),
        ...(input.isActive !== undefined && { is_active: input.isActive }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.assignedToId !== undefined && { assigned_to_id: input.assignedToId }),
        ...(input.assignedToName !== undefined && { assigned_to_name: input.assignedToName }),
      }).eq("id", id).select().single();
      if (error) throw error;
      return mapPMSchedule(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["pm-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["pm-schedules", id] });
    },
  });
}

export function useDeletePMSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("pm_schedules").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pm-schedules"] }),
  });
}
