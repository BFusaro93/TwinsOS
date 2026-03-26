import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProject } from "@/lib/supabase/mappers";
import type { Project } from "@/types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data.map(mapProject);
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: Omit<Project, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt" | "totalCost">
    ) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: input.name,
          customer_name: input.customerName,
          address: input.address,
          status: input.status,
          start_date: input.startDate || null,
          end_date: input.endDate,
          notes: input.notes,
        })
        .select()
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Project> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.customerName !== undefined && { customer_name: input.customerName }),
          ...(input.address !== undefined && { address: input.address }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.startDate !== undefined && { start_date: input.startDate || null }),
          ...(input.endDate !== undefined && { end_date: input.endDate }),
          ...(input.notes !== undefined && { notes: input.notes }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
