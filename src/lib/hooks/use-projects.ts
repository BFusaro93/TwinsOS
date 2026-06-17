import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapProject } from "@/lib/supabase/mappers";
import type { Project } from "@/types";

function patchProjectCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Project>) {
  // Patch all project list cache variants (includeArchived: true and false)
  for (const includeArchived of [true, false]) {
    queryClient.setQueryData<Project[]>(["projects", { includeArchived }], (old) =>
      old?.map((p) => p.id === id ? { ...p, ...patch } : p) ?? []
    );
  }
  // Also patch the single-project cache
  queryClient.setQueryData<Project>(["projects", id], (old) =>
    old ? { ...old, ...patch } : old
  );
}

/** Returns all non-deleted projects. Pass includeArchived=true to include archived ones (e.g. for admin views). */
export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ["projects", { includeArchived }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("projects")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (!includeArchived) q = q.eq("is_archived", false);
      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map(mapProject);
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
      input: Omit<Project, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt" | "totalCost" | "isArchived">
    ) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: input.name,
          customer_name: input.customerName,
          address: input.address,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.city  !== undefined && { city:  (input as any).city  }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.state !== undefined && { state: (input as any).state }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.zip   !== undefined && { zip:   (input as any).zip   }),
          status: input.status,
          start_date: input.startDate || null,
          end_date: input.endDate,
          contract_price: input.contractPrice ?? 0,
          labor_hours: input.laborHours ?? null,
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.city  !== undefined && { city:  (input as any).city  }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.state !== undefined && { state: (input as any).state }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.zip   !== undefined && { zip:   (input as any).zip   }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.startDate !== undefined && { start_date: input.startDate || null }),
          ...(input.endDate !== undefined && { end_date: input.endDate }),
          ...(input.contractPrice !== undefined && { contract_price: input.contractPrice }),
          ...(input.laborHours !== undefined && { labor_hours: input.laborHours }),
          ...(input.notes !== undefined && { notes: input.notes }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    onMutate: async ({ id, status, name, customerName, address, startDate, endDate, contractPrice, laborHours, notes }) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
      const patch: Partial<Project> = {};
      if (status !== undefined) patch.status = status;
      if (name !== undefined) patch.name = name;
      if (customerName !== undefined) patch.customerName = customerName;
      if (address !== undefined) patch.address = address;
      if (startDate !== undefined) patch.startDate = startDate ?? null;
      if (endDate !== undefined) patch.endDate = endDate;
      if (contractPrice !== undefined) patch.contractPrice = contractPrice;
      if (laborHours !== undefined) patch.laborHours = laborHours;
      if (notes !== undefined) patch.notes = notes;
      patchProjectCache(queryClient, id, patch);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData<Project[]>(["projects"], context.previous);
      }
    },
    onSettled: (_, _err, { id }) => {
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

/** Toggle is_archived on a project. Archived projects are hidden from lists and dropdowns. */
export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const supabase = createClient();
      // is_archived not in generated types yet — use type cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("projects")
        .update({ is_archived: archived, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, archived }) => {
      patchProjectCache(queryClient, id, { isArchived: archived });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
