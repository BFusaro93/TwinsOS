import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProjectSubcontractCost } from "@/lib/supabase/mappers";
import type { ProjectSubcontractCost, SubcontractCostType } from "@/types";

const QK = (projectId: string) => ["project-subcontract-costs", projectId];

export function useProjectSubcontractCosts(projectId: string) {
  return useQuery({
    queryKey: QK(projectId),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_subcontract_costs")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map(mapProjectSubcontractCost);
    },
    enabled: !!projectId,
  });
}

export interface CreateSubcontractCostInput {
  projectId: string;
  vendorId: string | null;
  vendorName: string;
  description: string;
  costType: SubcontractCostType;
  amount: number; // cents
  costDate: string | null;
  notes: string | null;
}

export function useCreateProjectSubcontractCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSubcontractCostInput) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("project_subcontract_costs")
        .insert({
          project_id: input.projectId,
          vendor_id: input.vendorId,
          vendor_name: input.vendorName,
          description: input.description,
          cost_type: input.costType,
          amount: input.amount,
          cost_date: input.costDate || null,
          notes: input.notes || null,
          created_by: userData.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return mapProjectSubcontractCost(data);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: QK(vars.projectId) });
    },
  });
}

export interface UpdateSubcontractCostInput {
  id: string;
  projectId: string;
  vendorId?: string | null;
  vendorName?: string;
  description?: string;
  costType?: SubcontractCostType;
  amount?: number;
  costDate?: string | null;
  notes?: string | null;
}

export function useUpdateProjectSubcontractCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId, ...input }: UpdateSubcontractCostInput) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("project_subcontract_costs")
        .update({
          ...(input.vendorId !== undefined && { vendor_id: input.vendorId }),
          ...(input.vendorName !== undefined && { vendor_name: input.vendorName }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.costType !== undefined && { cost_type: input.costType }),
          ...(input.amount !== undefined && { amount: input.amount }),
          ...(input.costDate !== undefined && { cost_date: input.costDate || null }),
          ...(input.notes !== undefined && { notes: input.notes || null }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapProjectSubcontractCost(data);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: QK(vars.projectId) });
    },
  });
}

export function useDeleteProjectSubcontractCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("project_subcontract_costs")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { projectId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QK(result.projectId) });
    },
  });
}
