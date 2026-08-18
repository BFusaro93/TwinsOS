import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { mapDamageCase, mapDamageCaseExpense } from "@/lib/supabase/mappers";
import { fireAutomationTrigger } from "@/lib/automations/fire-trigger-client";
import type { DamageCase, DamageCaseExpense, DamageCaseStatus, DamageCaseType } from "@/types";

export function useDamageCases() {
  return useQuery({
    queryKey: ["damage-cases"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("damage_cases")
        .select("*, damage_case_expenses(amount, deleted_at)")
        .is("deleted_at", null)
        .order("date_of_incident", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map((row) => ({
        ...mapDamageCase(row),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        totalCost: (row.damage_case_expenses as any[])
          .filter((e: { deleted_at: string | null }) => !e.deleted_at)
          .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0),
      }));
    },
  });
}

export function useDamageCase(id: string) {
  return useQuery({
    queryKey: ["damage-cases", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("damage_cases")
        .select("*, damage_case_expenses(*, deleted_at)")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return {
        ...mapDamageCase(data),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expenses: (data.damage_case_expenses as any[])
          .filter((e: { deleted_at: string | null }) => !e.deleted_at)
          .map(mapDamageCaseExpense) as DamageCaseExpense[],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        totalCost: (data.damage_case_expenses as any[])
          .filter((e: { deleted_at: string | null }) => !e.deleted_at)
          .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0),
      };
    },
    enabled: !!id,
  });
}

export function useCreateDamageCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      caseType: DamageCaseType;
      customerName: string;
      propertyAddress?: string;
      dateOfIncident: string;
      description: string;
      notes?: string;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: { user } } = await supabase.auth.getUser();

      // next_damage_case_number() derives the next number from a plain
      // COUNT(*) — two concurrent "New Damage Case" submissions in the same
      // org/year can compute the same number, so the insert can collide on
      // the UNIQUE(org_id, case_number) constraint. Retry with a freshly
      // generated number rather than surfacing a raw DB error and losing
      // the user's form input.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = null;
      let lastError: { code?: string; message?: string } | null = null;
      for (let attempt = 0; attempt < 3 && !data; attempt++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: caseNumber, error: rpcError } = await (supabase as any).rpc("next_damage_case_number");
        if (rpcError) throw rpcError;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: inserted, error } = await (supabase as any)
          .from("damage_cases")
          .insert({
            case_number: caseNumber,
            case_type: input.caseType,
            customer_name: input.customerName,
            property_address: input.propertyAddress || null,
            date_of_incident: input.dateOfIncident,
            description: input.description,
            resolution_notes: input.notes || null,
            created_by: user?.id ?? null,
          })
          .select()
          .single();

        if (!error) {
          data = inserted;
        } else if (error.code === "23505") {
          lastError = error;
          continue;
        } else {
          throw error;
        }
      }
      if (!data) throw lastError ?? new Error("Failed to create damage case");

      // damage_cases.customer_name is free text (no client_id FK — see
      // CLAUDE.md's "informal client name strings" gotcha, that migration is
      // deferred). Resolve it to a real client here, exact-match only
      // (trimmed/lowercased, same normalization the invoices bulk-import
      // byName lookup uses), purely to decide whether to fire the automation
      // trigger — nothing gets persisted back onto the damage_cases row.
      let matchedClientId: string | null = null;
      const normalizedName = input.customerName.trim().toLowerCase();
      if (normalizedName) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: clients } = await (supabase as any)
          .from("clients")
          .select("id, display_name")
          .is("deleted_at", null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = (clients ?? []).find((c: any) => c.display_name.trim().toLowerCase() === normalizedName);
        matchedClientId = match?.id ?? null;
      }

      return { ...mapDamageCase(data), matchedClientId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["damage-cases"] });
      if (result.matchedClientId) {
        fireAutomationTrigger({
          triggerType: "damage_case_created",
          clientId: result.matchedClientId,
          matchValues: [result.caseType],
        });
      }
    },
  });
}

export function useUpdateDamageCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DamageCase> & { id: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("damage_cases")
        .update({
          ...(input.status !== undefined && { status: input.status }),
          ...(input.caseType !== undefined && { case_type: input.caseType }),
          ...(input.customerName !== undefined && { customer_name: input.customerName }),
          ...(input.propertyAddress !== undefined && { property_address: input.propertyAddress }),
          ...(input.dateOfIncident !== undefined && { date_of_incident: input.dateOfIncident }),
          ...(input.description !== undefined && { description: input.description }),
          ...(input.resolutionNotes !== undefined && { resolution_notes: input.resolutionNotes }),
          ...(input.linkedPoId !== undefined && { purchase_order_id: input.linkedPoId }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapDamageCase(data);
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["damage-cases"] });
      queryClient.invalidateQueries({ queryKey: ["damage-cases", id] });
    },
  });
}

export function useDeleteDamageCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("damage_cases")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["damage-cases"] });
    },
  });
}

export function useCreateDamageCaseExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<DamageCaseExpense, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("damage_case_expenses")
        .insert({
          damage_case_id: input.damageCaseId,
          expense_date: input.expenseDate,
          vendor_id: input.vendorId || null,
          vendor_name: input.vendorName || null,
          description: input.description,
          amount: input.amount,
          purchase_order_id: input.purchaseOrderId || null,
        })
        .select()
        .single();
      if (error) throw error;
      return mapDamageCaseExpense(data);
    },
    onSuccess: (_, { damageCaseId }) => {
      queryClient.invalidateQueries({ queryKey: ["damage-cases"] });
      queryClient.invalidateQueries({ queryKey: ["damage-cases", damageCaseId] });
    },
  });
}

export function useDeleteDamageCaseExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, damageCaseId }: { id: string; damageCaseId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("damage_case_expenses")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return damageCaseId;
    },
    onSuccess: (damageCaseId) => {
      queryClient.invalidateQueries({ queryKey: ["damage-cases"] });
      queryClient.invalidateQueries({ queryKey: ["damage-cases", damageCaseId] });
    },
  });
}
