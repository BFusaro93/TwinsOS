"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CRMPackage, CRMPackageService } from "@/types/crm-packages";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPackageService(row: any): CRMPackageService {
  return {
    id: row.id,
    orgId: row.org_id,
    packageId: row.package_id,
    serviceId: row.service_id ?? null,
    serviceName: row.service_name,
    visitsIncluded: row.visits_included,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    name: row.name ?? null,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    minDays: row.min_days ?? null,
    defaultBHrs: row.default_b_hrs ?? null,
    defaultRateCents: row.default_rate_cents ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPackage(row: any): CRMPackage {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    code: row.code ?? null,
    description: row.description ?? null,
    descriptionOnEstimate: row.description_on_estimate ?? null,
    monthlyAmountCents: row.monthly_amount_cents,
    seasonMonths: row.season_months,
    visitsPerSeason: row.visits_per_season,
    isActive: row.is_active,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    services: (row.crm_package_services ?? []).map(mapPackageService),
  };
}

// ── list ──────────────────────────────────────────────────────────────────────

export function usePackages(includeInactive = false) {
  return useQuery({
    queryKey: ["crm-packages", includeInactive ? "all" : "active"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("crm_packages")
        .select("*, crm_package_services(*)")
        .is("deleted_at", null)
        .order("name")
        .order("sort_order", { foreignTable: "crm_package_services" });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data.map(mapPackage)) as CRMPackage[];
    },
  });
}

// ── create ────────────────────────────────────────────────────────────────────

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (values: Record<string, any>) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_packages")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return mapPackage(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-packages"] }),
  });
}

// ── update ────────────────────────────────────────────────────────────────────

export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_packages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-packages"] }),
  });
}

// ── soft delete ───────────────────────────────────────────────────────────────

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("crm_packages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-packages"] }),
  });
}

// ── package services (included services per package) ──────────────────────────

export function useUpsertPackageService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      packageId,
      row,
    }: {
      packageId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_package_services").upsert({ package_id: packageId, ...row } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-packages"] }),
  });
}

export function useDeletePackageService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("crm_package_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm-packages"] }),
  });
}
