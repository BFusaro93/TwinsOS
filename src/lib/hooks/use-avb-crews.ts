import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AvbCrew {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface UpsertCrewPayload {
  id?: string;
  code: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}

function mapCrew(row: Record<string, unknown>): AvbCrew {
  return {
    id:        row.id as string,
    code:      row.code as string,
    name:      row.name as string,
    sortOrder: (row.sort_order as number) ?? 0,
    isActive:  row.is_active !== false,
  };
}

async function getOrgId(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: profile, error } = await supabase
    .from("profiles").select("org_id").eq("id", user.id).single();
  if (error) throw error;
  return profile.org_id as string;
}

export function useAvbCrews() {
  return useQuery<AvbCrew[]>({
    queryKey: ["avb-crews"],
    queryFn: async () => {
      const supabase = createClient();
      const orgId = await getOrgId(supabase);
      const { data, error } = await supabase
        .from("avb_crews")
        .select("*")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("code",       { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => mapCrew(r as unknown as Record<string, unknown>));
    },
  });
}

export function useUpsertAvbCrew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertCrewPayload) => {
      const supabase = createClient();
      const orgId = await getOrgId(supabase);
      const code = input.code.toUpperCase().trim();
      const patch = {
        org_id:     orgId,
        code,
        name:       input.name.trim(),
        sort_order: input.sortOrder ?? 0,
        is_active:  input.isActive ?? true,
      };
      if (input.id) {
        const { error } = await supabase
          .from("avb_crews").update(patch).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("avb_crews").upsert(patch, { onConflict: "org_id,code" });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avb-crews"] }),
    onError: (err) => { console.error("[useUpsertAvbCrew]", err); },
  });
}

export function useDeleteAvbCrew() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("avb_crews").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["avb-crews"] }),
    onError: (err) => { console.error("[useDeleteAvbCrew]", err); },
  });
}
