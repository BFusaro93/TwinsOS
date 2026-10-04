import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapInjuryCase } from "@/lib/supabase/mappers";
import type { InjuryCase, InjuryCaseStatus, InjurySeverity } from "@/types";

export interface InjuryCaseInput {
  employeeName: string;
  dateOfIncident: string;
  severity: InjurySeverity;
  location?: string | null;
  injuryType?: string | null;
  bodyPart?: string | null;
  description: string;
  treatment?: string | null;
  daysAway?: number;
  recordable?: boolean;
}

const CLOSED: InjuryCaseStatus[] = ["resolved", "closed"];

export function useInjuryCases() {
  return useQuery({
    queryKey: ["injury-cases"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("injury_cases")
        .select("*")
        .is("deleted_at", null)
        .order("date_of_incident", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map(mapInjuryCase);
    },
  });
}

export function useInjuryCase(id: string) {
  return useQuery({
    queryKey: ["injury-cases", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("injury_cases")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapInjuryCase(data);
    },
    enabled: !!id,
  });
}

export function useCreateInjuryCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InjuryCaseInput) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // next_injury_case_number() is an atomic per-org/year counter, but the
      // RPC and the INSERT are separate requests — keep the retry on a
      // UNIQUE(org_id, case_number) collision (same as damage cases).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      let lastError: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: caseNumber, error: rpcError } = await (supabase as any).rpc("next_injury_case_number");
        if (rpcError) throw rpcError;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error } = await (supabase as any)
          .from("injury_cases")
          .insert({
            case_number: caseNumber,
            employee_name: input.employeeName,
            date_of_incident: input.dateOfIncident,
            severity: input.severity,
            location: input.location || null,
            injury_type: input.injuryType || null,
            body_part: input.bodyPart || null,
            description: input.description,
            treatment: input.treatment || null,
            days_away: input.daysAway ?? 0,
            recordable: input.recordable ?? false,
            created_by: user?.id ?? null,
          })
          .select()
          .single();
        if (!error) data = inserted;
        else if (error.code === "23505") lastError = error;
        else throw error;
      }
      if (!data) throw lastError ?? new Error("Failed to create injury case");
      return mapInjuryCase(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["injury-cases"] });
    },
  });
}

// Everything except status and resolution notes describes the incident itself;
// once a case is resolved/closed it's a finished record, so those are locked
// until it's reopened (mirrors damage cases).
const SUBSTANTIVE_FIELDS = [
  "employeeName", "dateOfIncident", "severity", "location", "injuryType",
  "bodyPart", "description", "treatment", "daysAway", "recordable",
] as const;

export function useUpdateInjuryCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<InjuryCase> & { id: string }) => {
      const supabase = createClient();

      if (SUBSTANTIVE_FIELDS.some((f) => input[f] !== undefined)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: current, error: fetchError } = await (supabase as any)
          .from("injury_cases").select("status").eq("id", id).single();
        if (fetchError) throw fetchError;
        const reopening = input.status !== undefined && !CLOSED.includes(input.status);
        if (CLOSED.includes(current?.status) && !reopening) {
          throw new Error("This case is resolved/closed. Reopen it before editing its details.");
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("injury_cases")
        .update({
          ...(input.status !== undefined && { status: input.status }),
          ...(input.employeeName !== undefined && { employee_name: input.employeeName }),
          ...(input.dateOfIncident !== undefined && { date_of_incident: input.dateOfIncident }),
          ...(input.severity !== undefined && { severity: input.severity }),
          ...(input.location !== undefined && { location: input.location }),
          ...(input.injuryType !== undefined && { injury_type: input.injuryType }),
          ...(input.bodyPart !== undefined && { body_part: input.bodyPart }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.treatment !== undefined && { treatment: input.treatment }),
          ...(input.daysAway !== undefined && { days_away: input.daysAway }),
          ...(input.recordable !== undefined && { recordable: input.recordable }),
          ...(input.resolutionNotes !== undefined && { resolution_notes: input.resolutionNotes }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapInjuryCase(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["injury-cases"] });
      queryClient.invalidateQueries({ queryKey: ["injury-cases", id] });
    },
  });
}

export function useDeleteInjuryCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: current } = await (supabase as any)
        .from("injury_cases").select("status").eq("id", id).single();
      if (CLOSED.includes(current?.status)) {
        throw new Error("This case is resolved/closed. Reopen it before deleting it.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("injury_cases")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["injury-cases"] });
    },
  });
}
