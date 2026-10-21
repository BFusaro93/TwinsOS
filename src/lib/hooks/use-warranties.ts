"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMWarranty, WarrantyType } from "@/types/crm-warranties";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapType(row: any): WarrantyType {
  return {
    id: row.id,
    name: row.name,
    defaultDurationMonths: row.default_duration_months,
    defaultCoverage: row.default_coverage ?? null,
    sortOrder: row.sort_order ?? 0,
    isActive: row.is_active ?? true,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapWarranty(row: any): CRMWarranty {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cases = ((row.damage_cases ?? []) as any[]).filter((c) => !c.deleted_at);
  const claimedCents = cases.reduce(
    (sum, c) =>
      sum +
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((c.damage_case_expenses ?? []) as any[])
        .filter((e) => !e.deleted_at)
        .reduce((s, e) => s + (e.amount ?? 0), 0),
    0,
  );
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: row.clients?.display_name ?? null,
    projectId: row.project_id ?? null,
    projectName: row.projects?.name ?? null,
    jobId: row.job_id ?? null,
    warrantyTypeId: row.warranty_type_id ?? null,
    name: row.name,
    coverage: row.coverage ?? null,
    durationMonths: row.duration_months,
    status: row.status,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    damagesCoveredCents: row.damages_covered_cents ?? null,
    notes: row.notes ?? null,
    voidReason: row.void_reason ?? null,
    renewedFromId: row.renewed_from_id ?? null,
    createdAt: row.created_at,
    claimedCents,
    claimCount: cases.length,
  };
}

const WARRANTY_SELECT =
  "*, clients(display_name), projects(name), damage_cases(id, deleted_at, damage_case_expenses(amount, deleted_at))";

export interface WarrantyScope {
  clientId?: string;
  projectId?: string;
  jobId?: string;
}

export function useWarranties(scope: WarrantyScope = {}) {
  return useQuery({
    queryKey: ["crm-warranties", scope],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      let q = supabase.from("crm_warranties").select(WARRANTY_SELECT).is("deleted_at", null);
      if (scope.clientId) q = q.eq("client_id", scope.clientId);
      if (scope.projectId) q = q.eq("project_id", scope.projectId);
      if (scope.jobId) q = q.eq("job_id", scope.jobId);
      const { data, error } = await q.order("end_date", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []).map(mapWarranty) as CRMWarranty[];
    },
  });
}

/** Warranties available to claim against, for the damage-case picker. */
export function useClaimableWarranties() {
  return useWarranties();
}

export interface WarrantyInput {
  clientId: string;
  projectId?: string | null;
  jobId?: string | null;
  warrantyTypeId?: string | null;
  name: string;
  coverage?: string | null;
  durationMonths: number;
  /** null = pending until the project completes. */
  startDate: string | null;
  endDate: string | null;
  damagesCoveredCents?: number | null;
  notes?: string | null;
  renewedFromId?: string | null;
}

function toRow(input: WarrantyInput) {
  const active = !!input.startDate && !!input.endDate;
  return {
    client_id: input.clientId,
    project_id: input.projectId ?? null,
    job_id: input.jobId ?? null,
    warranty_type_id: input.warrantyTypeId ?? null,
    name: input.name.trim(),
    coverage: input.coverage?.trim() || null,
    duration_months: input.durationMonths,
    status: active ? "active" : "pending",
    start_date: active ? input.startDate : null,
    end_date: active ? input.endDate : null,
    damages_covered_cents: input.damagesCoveredCents ?? null,
    notes: input.notes?.trim() || null,
    renewed_from_id: input.renewedFromId ?? null,
  };
}

export function useCreateWarranty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WarrantyInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("crm_warranties").insert({ ...toRow(input), created_by: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-warranties"] }),
  });
}

export function useUpdateWarranty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: WarrantyInput & { id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase.from("crm_warranties").update(toRow(input)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-warranties"] }),
  });
}

export function useVoidWarranty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("crm_warranties")
        .update({ status: "void", void_reason: reason.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-warranties"] }),
  });
}

export function useDeleteWarranty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("crm_warranties")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-warranties"] }),
  });
}

// ── types ─────────────────────────────────────────────────────────────────────

export function useWarrantyTypes() {
  return useQuery({
    queryKey: ["crm-warranty-types"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("crm_warranty_types")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return (data ?? []).map(mapType) as WarrantyType[];
    },
  });
}

export function useSaveWarrantyType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; defaultDurationMonths: number; defaultCoverage: string | null }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const row = {
        name: input.name.trim(),
        default_duration_months: input.defaultDurationMonths,
        default_coverage: input.defaultCoverage?.trim() || null,
      };
      const { error } = input.id
        ? await supabase.from("crm_warranty_types").update(row).eq("id", input.id)
        : await supabase.from("crm_warranty_types").insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-warranty-types"] }),
  });
}

export function useDeleteWarrantyType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { error } = await supabase
        .from("crm_warranty_types")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-warranty-types"] }),
  });
}
