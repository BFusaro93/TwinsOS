import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapInjuryCase, mapInjuryCaseExpense } from "@/lib/supabase/mappers";
import type { InjuryCase, InjuryCaseExpense, InjuryCaseStatus, InjuryClaimRoute, InjuryExpenseType, InjurySeverity } from "@/types";

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
  claimRoute?: InjuryClaimRoute | null;
}

const CLOSED: InjuryCaseStatus[] = ["resolved", "closed"];

function sumExpenses(rows: { amount: number; deleted_at: string | null }[] | null | undefined): number {
  return (rows ?? []).filter((e) => !e.deleted_at).reduce((sum, e) => sum + e.amount, 0);
}

export function useInjuryCases() {
  return useQuery({
    queryKey: ["injury-cases"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("injury_cases")
        .select("*, injury_case_expenses(amount, deleted_at)")
        .is("deleted_at", null)
        .order("date_of_incident", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((row) => ({ ...mapInjuryCase(row), totalCost: sumExpenses(row.injury_case_expenses) }));
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
        .select("*, injury_case_expenses(*)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return {
        ...mapInjuryCase(data),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expenses: ((data.injury_case_expenses ?? []) as any[])
          .filter((e) => !e.deleted_at)
          .sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1))
          .map(mapInjuryCaseExpense) as InjuryCaseExpense[],
        totalCost: sumExpenses(data.injury_case_expenses),
      };
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
            claim_route: input.claimRoute ?? null,
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
  "bodyPart", "description", "treatment", "daysAway", "recordable", "claimRoute",
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
          ...(input.claimRoute !== undefined && { claim_route: input.claimRoute }),
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
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
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

async function assertInjuryCaseOpen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  injuryCaseId: string,
  action: string,
): Promise<void> {
  const { data, error } = await supabase.from("injury_cases").select("status").eq("id", injuryCaseId).single();
  if (error) throw error;
  if (CLOSED.includes(data?.status)) {
    throw new Error(`This case is resolved/closed. Reopen it before ${action}.`);
  }
}

export interface InjuryExpenseInput {
  injuryCaseId: string;
  expenseDate: string;
  expenseType: InjuryExpenseType;
  vendorId: string | null;
  vendorName: string | null;
  description: string;
  amount: number; // cents
}

export function useCreateInjuryCaseExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InjuryExpenseInput) => {
      const supabase = createClient();
      await assertInjuryCaseOpen(supabase, input.injuryCaseId, "adding expenses");
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("injury_case_expenses")
        .insert({
          injury_case_id: input.injuryCaseId,
          expense_date: input.expenseDate,
          expense_type: input.expenseType,
          vendor_id: input.vendorId || null,
          vendor_name: input.vendorName || null,
          description: input.description,
          amount: input.amount,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapInjuryCaseExpense(data);
    },
    onSuccess: (_, { injuryCaseId }) => {
      queryClient.invalidateQueries({ queryKey: ["injury-cases"] });
      queryClient.invalidateQueries({ queryKey: ["injury-cases", injuryCaseId] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}

export function useDeleteInjuryCaseExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, injuryCaseId }: { id: string; injuryCaseId: string }) => {
      const supabase = createClient();
      await assertInjuryCaseOpen(supabase, injuryCaseId, "deleting expenses");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("injury_case_expenses")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return injuryCaseId;
    },
    onSuccess: (injuryCaseId) => {
      queryClient.invalidateQueries({ queryKey: ["injury-cases"] });
      queryClient.invalidateQueries({ queryKey: ["injury-cases", injuryCaseId] });
      queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
  });
}
