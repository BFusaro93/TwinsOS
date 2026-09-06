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

      // next_damage_case_number() hands out DC-YYYY-NNN from an atomic
      // per-org/year counter (damage_case_counters, see 20260829100000).
      // The RPC and the INSERT are still two separate requests, so keep the
      // retry on a UNIQUE(org_id, case_number) collision rather than
      // surfacing a raw DB error and losing the user's form input.
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

// Fields that describe the case's substance / liability — editing these once
// a case is resolved/closed would let its cost or story silently change
// after the fact. A status change (including reopening) is always allowed;
// only these fields are gated on the CURRENT (pre-update) status.
// `linkedPoId` is intentionally excluded: unlinking a dangling/deleted PO
// reference is cleanup, not a re-billing risk, and should stay available
// even on a closed case (see DamageCaseDetailPanel's dangling-PO handling).
// `resolutionNotes` is also excluded: it's the one field that legitimately
// belongs to the resolved state (written at/after resolve time), so it stays
// editable while the case is resolved/closed.
const SUBSTANTIVE_DAMAGE_CASE_FIELDS = [
  "caseType",
  "customerName",
  "propertyAddress",
  "dateOfIncident",
  "description",
] as const;

const CLOSED_DAMAGE_CASE_STATUSES: DamageCaseStatus[] = ["resolved", "closed"];

/** Throws if the case is resolved/closed — server-side mirror of the UI lock. */
async function assertDamageCaseOpen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  damageCaseId: string,
  action: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("damage_cases")
    .select("status")
    .eq("id", damageCaseId)
    .single();
  if (error) throw error;
  if (CLOSED_DAMAGE_CASE_STATUSES.includes(data?.status as DamageCaseStatus)) {
    throw new Error(`This case is resolved/closed. Reopen it before ${action}.`);
  }
}

export function useUpdateDamageCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<DamageCase> & { id: string }) => {
      const supabase = createClient();

      const editsSubstantiveField = SUBSTANTIVE_DAMAGE_CASE_FIELDS.some(
        (field) => input[field] !== undefined,
      );
      if (editsSubstantiveField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: current, error: fetchError } = await (supabase as any)
          .from("damage_cases")
          .select("status")
          .eq("id", id)
          .single();
        if (fetchError) throw fetchError;
        const currentStatus = current?.status as DamageCaseStatus | undefined;
        // If the caller is also moving the case to an open status in this
        // same update, that's a reopen — allow it through.
        const reopening = input.status !== undefined && !CLOSED_DAMAGE_CASE_STATUSES.includes(input.status);
        if (currentStatus && CLOSED_DAMAGE_CASE_STATUSES.includes(currentStatus) && !reopening) {
          throw new Error("This case is resolved/closed. Reopen it before editing its details, linked PO, or adding expenses.");
        }
      }

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
      // A resolved/closed case is a finished liability record — deleting it
      // (and its expense total) after the fact is exactly what the lock exists
      // to prevent. Reopen first.
      await assertDamageCaseOpen(supabase, id, "deleting it");
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
      await assertDamageCaseOpen(supabase, input.damageCaseId, "adding expenses");

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
      // Deleting an expense changes a resolved case's Total Cost — same lock
      // as adding one.
      await assertDamageCaseOpen(supabase, damageCaseId, "deleting expenses");
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
