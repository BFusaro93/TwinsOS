import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ProjectDirectItem {
  id: string;
  orgId: string;
  projectId: string;
  productItemId: string | null;
  productItemName: string;
  partNumber: string;
  quantity: number;
  unitCost: number; // cents
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDirectItem(row: any): ProjectDirectItem {
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    productItemId: row.product_item_id ?? null,
    productItemName: row.product_item_name,
    partNumber: row.part_number,
    quantity: Number(row.quantity),
    unitCost: row.unit_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

const QK = (projectId: string) => ["project-direct-items", projectId];

export function useProjectDirectItems(projectId: string) {
  return useQuery({
    queryKey: QK(projectId),
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("project_direct_items")
        .select("*")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data.map(mapDirectItem)) as ProjectDirectItem[];
    },
    enabled: !!projectId,
  });
}

export interface AddDirectItemInput {
  projectId: string;
  productItemId: string | null;
  productItemName: string;
  partNumber: string;
  quantity: number;
  unitCost: number; // cents
}

export function useAddProjectDirectItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddDirectItemInput): Promise<ProjectDirectItem> => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", userData.user!.id)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("project_direct_items")
        .insert({
          org_id: profile!.org_id,
          project_id: input.projectId,
          product_item_id: input.productItemId || null,
          product_item_name: input.productItemName,
          part_number: input.partNumber,
          quantity: input.quantity,
          unit_cost: input.unitCost,
          created_by: userData.user?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return mapDirectItem(data);
    },
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: QK(item.projectId) });
    },
  });
}

export function useUpdateProjectDirectItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      projectId,
      quantity,
      unitCost,
    }: {
      id: string;
      projectId: string;
      quantity: number;
      unitCost: number;
    }): Promise<ProjectDirectItem> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("project_direct_items")
        .update({ quantity, unit_cost: unitCost, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapDirectItem(data);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: QK(vars.projectId) });
    },
  });
}

export function useDeleteProjectDirectItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("project_direct_items")
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
