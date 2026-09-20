"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { RateMatrixRow } from "@/lib/hooks/use-rate-matrix";
import type {
  ApplyPriceAdjustmentInput,
  PreviewPriceAdjustmentInput,
  PriceAdjustmentPreview,
  PriceAdjustmentRun,
} from "@/types/crm-pricing";

// ── all rate-matrix rows, across every service ───────────────────────────────

// Kept in sync with mapRow in use-rate-matrix.ts (same table, same columns).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): RateMatrixRow {
  return {
    id: row.id,
    orgId: row.org_id,
    serviceId: row.service_id,
    customFieldId: row.custom_field_id,
    calcType: row.calc_type as 0 | 1,
    fromVal: Number(row.from_val ?? 0),
    toVal: row.to_val != null ? Number(row.to_val) : null,
    rateCents: row.rate_cents ?? 0,
    budgetedHours: Number(row.budgeted_hours ?? 0),
    budgetedCostCents: row.budgeted_cost_cents ?? 0,
    sortOrder: row.sort_order ?? 0,
    isTailRow: row.is_tail_row ?? false,
    tailEveryQty: row.tail_every_qty != null ? Number(row.tail_every_qty) : null,
    tailOverQty: row.tail_over_qty != null ? Number(row.tail_over_qty) : null,
  };
}

/**
 * Every service's rate-matrix rows in one query. The bulk price dialog needs
 * them all up front: a service whose price lives in a matrix has a meaningless
 * `default_rate_cents`, so adjusting only the catalog column would leave
 * matrix-priced services quoting last year's numbers.
 */
export function useAllRateMatrixRows() {
  return useQuery({
    queryKey: ["rate-matrix", "all"],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("crm_service_rate_matrix")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return ((data ?? []).map(mapRow)) as RateMatrixRow[];
    },
  });
}

// ── bulk catalog price write ─────────────────────────────────────────────────

export interface BulkCatalogPriceUpdate {
  /** `crm_services.default_rate_cents` */
  services: { id: string; defaultRateCents: number | null }[];
  /** `crm_service_rate_matrix.rate_cents` */
  matrixRows: { id: string; rateCents: number }[];
  /** `crm_services.matrix_tail_rate_cents` — overflow pricing past the last tier. */
  serviceTails: { id: string; matrixTailRateCents: number }[];
}

/**
 * Writes catalog prices. Sequential rather than Promise.all: these rows fire
 * the fn_audit_log() trigger on crm_services, and a burst of parallel writes
 * against the pooled connection is how we get intermittent failures partway
 * through a run with no record of which half landed.
 */
export function useBulkUpdateCatalogPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ services, matrixRows, serviceTails }: BulkCatalogPriceUpdate) => {
      const supabase = createClient();

      // A service can appear in both `services` and `serviceTails`; merge the
      // patches so it takes one UPDATE instead of two that race each other.
      const servicePatches = new Map<string, Record<string, number | null>>();
      for (const s of services) {
        servicePatches.set(s.id, { default_rate_cents: s.defaultRateCents });
      }
      for (const t of serviceTails) {
        servicePatches.set(t.id, {
          ...(servicePatches.get(t.id) ?? {}),
          matrix_tail_rate_cents: t.matrixTailRateCents,
        });
      }

      for (const [id, patch] of servicePatches) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_services")
          .update(patch)
          .eq("id", id);
        if (error) throw error;
      }

      for (const row of matrixRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("crm_service_rate_matrix")
          .update({ rate_cents: row.rateCents })
          .eq("id", row.id);
        if (error) throw error;
      }

      return { serviceCount: servicePatches.size, matrixCount: matrixRows.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-services"] });
      qc.invalidateQueries({ queryKey: ["rate-matrix"] });
    },
  });
}

// ── price adjustment runs ────────────────────────────────────────────────────

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof json?.error === "string" ? json.error : "Request failed";
    throw new Error(message);
  }
  return json as T;
}

/**
 * Dry-runs an adjustment. Kept as a mutation rather than a query: the user
 * asks for a preview explicitly, and re-fetching one behind their back while
 * they read it would be worse than stale.
 */
export function usePreviewPriceAdjustment() {
  return useMutation({
    mutationFn: (input: PreviewPriceAdjustmentInput) =>
      postJson<PriceAdjustmentPreview>("/api/crm/pricing/adjustments/preview", input),
  });
}

export function useApplyPriceAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyPriceAdjustmentInput) =>
      postJson<{ id: string; lineCount: number; skipped: number }>("/api/crm/pricing/adjustments", input),
    onSuccess: () => {
      // A run rewrites job service rates, which the rollup trigger cascades
      // into crm_jobs.rate_cents — so job, visit and package caches are all
      // stale, not just the run history.
      qc.invalidateQueries({ queryKey: ["price-adjustments"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-packages"] });
    },
  });
}

export function usePriceAdjustments() {
  return useQuery({
    queryKey: ["price-adjustments"],
    queryFn: async () => {
      const res = await fetch("/api/crm/pricing/adjustments");
      if (!res.ok) throw new Error("Failed to load price adjustments");
      const json = (await res.json()) as { runs: PriceAdjustmentRun[] };
      return json.runs;
    },
  });
}

export function useRevertPriceAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      postJson<{ reverted: number; skipped: number }>(
        `/api/crm/pricing/adjustments/${id}/revert`
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["price-adjustments"] });
      qc.invalidateQueries({ queryKey: ["crm-jobs"] });
      qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
      qc.invalidateQueries({ queryKey: ["crm-packages"] });
    },
  });
}
