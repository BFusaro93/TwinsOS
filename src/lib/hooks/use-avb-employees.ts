import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface AvbEmployee {
  id: string;
  uuid: string;
  name: string;
  csvName: string;
  csvJob: string;
  defaultCrew: string;
  isField: boolean;
  isActive: boolean;
}

export type UpsertEmpPayload = Omit<AvbEmployee, "id"> & { id?: string };

function mapRow(row: Record<string, unknown>): AvbEmployee {
  return {
    id: row.id as string,
    uuid: row.uuid as string,
    name: row.name as string,
    csvName: row.csv_name as string,
    csvJob: row.csv_job as string,
    defaultCrew: row.default_crew as string,
    isField: row.is_field as boolean,
    isActive: row.is_active as boolean,
  };
}

/** Returns all non-deleted employees (active + inactive) for the org. */
export function useAvbEmployees() {
  return useQuery<AvbEmployee[]>({
    queryKey: ["avb-employees"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("avb_employees")
        .select("id, uuid, name, csv_name, csv_job, default_crew, is_field, is_active")
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r: Record<string, unknown>) => mapRow(r));
    },
  });
}

/** Hard-deletes an employee row (sets deleted_at). For removing duplicate entries. */
export function useDeleteAvbEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("avb_employees")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avb-employees"] }),
  });
}

/** Upserts an employee. Conflict key: (org_id, uuid). */
export function useUpsertAvbEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (emp: UpsertEmpPayload) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org found for user");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("avb_employees")
        .upsert(
          {
            ...(emp.id ? { id: emp.id } : {}),
            org_id: orgId,
            uuid: emp.uuid,
            name: emp.name,
            csv_name: emp.csvName,
            csv_job: emp.csvJob,
            default_crew: emp.defaultCrew,
            is_field: emp.isField,
            is_active: emp.isActive,
          },
          { onConflict: "org_id,uuid" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["avb-employees"] }),
  });
}
