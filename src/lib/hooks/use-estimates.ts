"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  Estimate,
  EstimateLineItem,
  EstimateDirectCost,
  EstimateChangeRequest,
} from "@/types/crm-estimates";
import type { OverheadSettings } from "@/lib/hooks/use-overhead-settings";
import { computeDirectCostOverhead } from "@/lib/estimate-calc";

// ── mappers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLineItem(row: any): EstimateLineItem {
  return {
    id: row.id,
    orgId: row.org_id,
    estimateId: row.estimate_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    status: row.status,
    calcType: row.calc_type,
    qty: Number(row.qty),
    rateCents: row.rate_cents,
    visits: row.visits,
    totalCents: row.total_cents,
    discountCents: row.discount_cents ?? 0,
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? null,
    appliedDiscountId: row.applied_discount_id ?? null,
    budgetedHours: Number(row.budgeted_hours),
    totalBudgetedHours: Number(row.total_budgeted_hours),
    costCents: row.cost_cents,
    totalCostCents: row.total_cost_cents,
    marginBps: row.margin_bps,
    markupBps: row.markup_bps,
    adjRateCents: row.adj_rate_cents,
    unitType: row.unit_type ?? null,
    productionRateSqftPerHr: row.production_rate_sqft_per_hr ? Number(row.production_rate_sqft_per_hr) : null,
    budgetMethod: row.budget_method ?? "manual",
    sortOrder: row.sort_order,
    estimateDesc: row.estimate_desc ?? null,
    jobNote: row.job_note ?? null,
    invoiceDesc: row.invoice_desc ?? null,
    internalNote: row.internal_note ?? null,
    rowType: (row.row_type as 'item' | 'section') ?? 'item',
    sectionName: row.section_name ?? null,
    tier: (row.tier as 'basic' | 'standard' | 'premium' | null) ?? null,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDirectCost(row: any): EstimateDirectCost {
  return {
    id: row.id,
    orgId: row.org_id,
    estimateId: row.estimate_id,
    description: row.description,
    costType: row.cost_type,
    productItemId: row.product_item_id ?? null,
    qty: Number(row.qty),
    rateCents: row.rate_cents,
    totalCents: row.total_cents,
    overheadCents: row.overhead_cents,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEstimate(row: any): Estimate {
  return {
    id: row.id,
    orgId: row.org_id,
    estimateNumber: row.estimate_number,
    clientId: row.client_id,
    description: row.description,
    salesRepId: row.sales_rep_id,
    source: row.source,
    estDocument: row.est_document,
    stage: row.stage,
    approvalStatus: (row.approval_status as Estimate['approvalStatus']) ?? 'not_required',
    sentAt: row.sent_at ?? null,
    showDiscounts: row.show_discounts,
    estimateDate: row.estimate_date,
    validUntilDate: row.valid_until_date,
    numInstallments: row.num_installments,
    installmentDayOfMonth: row.installment_day_of_month ?? null,
    paymentPlanType: (row.payment_plan_type as Estimate['paymentPlanType']) ?? 'installments',
    poNumber: row.po_number,
    workOrderNumber: row.work_order_number,
    paymentTerms: row.payment_terms ?? null,
    subtotalCents: row.subtotal_cents,
    discountCents: row.discount_cents,
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? null,
    appliedDiscountId: row.applied_discount_id ?? null,
    taxRateBps: row.tax_rate_bps,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    revenueCents: row.revenue_cents,
    overheadRateBps: row.overhead_rate_bps,
    overheadCostCents: row.overhead_cost_cents,
    grossProfitCents: row.gross_profit_cents,
    netProfitCents: row.net_profit_cents,
    totalBudgetedHours: Number(row.total_budgeted_hours),
    probabilityBps: row.probability_bps ?? 0,
    notes: row.notes,
    reason: row.reason ?? null,
    depositRequiredCents: row.deposit_required_cents ?? 0,
    depositCollectedCents: row.deposit_collected_cents ?? 0,
    depositMethod: (row.deposit_method as Estimate['depositMethod']) ?? null,
    depositReference: (row.deposit_reference as string | null) ?? null,
    depositNotes: (row.deposit_notes as string | null) ?? null,
    depositCollectedAt: (row.deposit_collected_at as string | null) ?? null,
    tiersEnabled: row.tiers_enabled ?? false,
    tierLabels: (row.tier_labels as { basic: string; standard: string; premium: string }) ?? { basic: 'Basic', standard: 'Standard', premium: 'Premium' },
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    clientName: row.clients?.display_name ?? null,
    clientAddress: row.clients?.billing_address ?? null,
    clientCity: row.clients?.billing_city ?? null,
    clientState: row.clients?.billing_state ?? null,
    clientZip: row.clients?.billing_zip ?? null,
    clientPhone: row.clients?.primary_phone ?? null,
    clientEmail: row.clients?.primary_email ?? null,
    clientSince: row.clients?.client_since ?? null,
    salesRepName: row.profiles?.name ?? null,
    lineItems: (row.estimate_line_items ?? []).map(mapLineItem),
    directCosts: (row.estimate_direct_costs ?? []).map(mapDirectCost),
  };
}

// ── list ──────────────────────────────────────────────────────────────────────

export function useEstimates(clientId?: string) {
  return useQuery({
    queryKey: ["estimates", clientId ?? "all"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      let q = supabase
        .from("estimates")
        .select("*, clients(display_name, billing_address, billing_city, billing_state, billing_zip, primary_phone, primary_email, client_since), profiles!estimates_sales_rep_id_fkey(name)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data.map(mapEstimate)) as Estimate[];
    },
  });
}

// ── single estimate with full detail ─────────────────────────────────────────

export function useEstimate(id: string) {
  return useQuery({
    queryKey: ["estimates", "detail", id],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimates")
        .select(`
          *,
          clients(display_name, billing_address, billing_city, billing_state, billing_zip, primary_phone, primary_email, client_since),
          profiles!estimates_sales_rep_id_fkey(name),
          estimate_line_items(*),
          estimate_direct_costs(*)
        `)
        .eq("id", id)
        .is("deleted_at", null)
        .order("sort_order", { foreignTable: "estimate_line_items" })
        .order("sort_order", { foreignTable: "estimate_direct_costs" })
        .single();
      if (error) throw error;
      return mapEstimate(data);
    },
    enabled: !!id,
  });
}

// ── create ────────────────────────────────────────────────────────────────────

export function useCreateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      clientId: string;
      description: string;
      salesRepId?: string;
      estimateDate: string;
      validUntilDate?: string;
      stage?: string;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimates")
        .insert({
          created_by: user?.id ?? null,
          client_id: values.clientId,
          description: values.description,
          sales_rep_id: values.salesRepId ?? null,
          estimate_date: values.estimateDate,
          valid_until_date: values.validUntilDate ?? null,
          stage: values.stage ?? "draft",
        })
        .select()
        .single();
      if (error) throw error;

      // log to client activity timeline
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("client_activity").insert({
        client_id: values.clientId,
        activity_type: "estimate",
        subject: `Estimate created: ${values.description}`,
        ref_id: data.id,
        ref_table: "estimates",
      });

      return mapEstimate(data);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
      qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

export function useBulkImportEstimates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: Record<string, string>[]) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data: clients } = await supabase.from("clients").select("id, display_name").is("deleted_at", null);
      const byName = new Map((clients ?? []).map((c) => [c.display_name.trim().toLowerCase(), c.id]));

      let created = 0;
      let skipped = 0;

      for (const r of rows) {
        const clientId = byName.get(r.clientName?.trim().toLowerCase() ?? "");
        const description = r.description?.trim();
        if (!clientId || !description) { skipped++; continue; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("estimates").insert({
          created_by: user?.id ?? null,
          client_id: clientId,
          description,
          estimate_date: r.estimateDate?.trim() || new Date().toISOString().split("T")[0],
          valid_until_date: r.validUntilDate?.trim() || null,
          po_number: r.poNumber?.trim() || null,
          stage: (r.stage?.trim().toLowerCase() as Estimate['stage']) || "draft",
        });
        if (error) throw error;
        created++;
      }

      return { created, skipped };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}

// ── update header ─────────────────────────────────────────────────────────────

export function useUpdateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      patch: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimates")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}

// ── update stage ──────────────────────────────────────────────────────────────

export function useUpdateEstimateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, clientId, reason }: { id: string; stage: string; clientId?: string; reason?: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existing } = await (supabase as any)
        .from("estimates")
        .select("client_id, description")
        .eq("id", id)
        .single();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: Record<string, unknown> = { stage };
      if (reason !== undefined) patch.reason = reason;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimates")
        .update(patch)
        .eq("id", id);
      if (error) throw error;

      if (stage === "sent") {
        // Draft line items aren't proposed to the client yet — moving to
        // "sent" (even manually, outside the email-send flow) is the "go
        // live" moment, so bump them to quote (same as Service Autopilot).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("estimate_line_items")
          .update({ status: "quote" })
          .eq("estimate_id", id)
          .eq("status", "draft");
      }

      const resolvedClientId = clientId ?? existing?.client_id;
      if (resolvedClientId) {
        const stageLabel: Record<string, string> = {
          sent: "Estimate sent to client",
          won: "Estimate won",
          lost: "Estimate lost",
          approved: "Estimate approved",
        };
        const subject = stageLabel[stage] ?? `Estimate moved to ${stage}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("client_activity").insert({
          client_id: resolvedClientId,
          activity_type: "estimate",
          subject,
          ref_id: id,
          ref_table: "estimates",
        });
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
      if (vars.clientId) qc.invalidateQueries({ queryKey: ["clients", vars.clientId, "activity"] });
    },
  });
}

// ── upsert line item ──────────────────────────────────────────────────────────

export function useUpsertLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      estimateId,
      item,
    }: {
      estimateId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item: Record<string, any>;
    }) => {
      const supabase = createClient();
      // A blind .upsert() with a partial payload (e.g. just a discount or
      // notes patch on an existing row) fails NOT NULL validation on columns
      // like service_name that aren't in the patch — Postgres checks the
      // INSERT side of "INSERT ... ON CONFLICT DO UPDATE" regardless of
      // whether the conflict branch fires. Existing rows must go through a
      // real UPDATE instead.
      if (item.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { id, ...patch } = item;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("estimate_line_items")
          .update(patch)
          .eq("id", id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from("estimate_line_items")
          .insert({ estimate_id: estimateId, ...item });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.estimateId] });
    },
  });
}

// ── delete line item (soft) ───────────────────────────────────────────────────

export function useDeleteLineItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estimateId }: { id: string; estimateId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_line_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { estimateId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.estimateId] });
    },
  });
}

// ── upsert direct cost ────────────────────────────────────────────────────────

export function useUpsertDirectCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      estimateId,
      item,
    }: {
      estimateId: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      item: Record<string, any>;
    }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_direct_costs")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert({ estimate_id: estimateId, ...item } as any);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.estimateId] });
    },
  });
}

// ── delete direct cost ────────────────────────────────────────────────────────

export function useDeleteDirectCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estimateId }: { id: string; estimateId: string }) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_direct_costs")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { estimateId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.estimateId] });
    },
  });
}

// ── duplicate estimate ────────────────────────────────────────────────────────

export function useDuplicateEstimate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      description,
      resetStatus,
    }: {
      id: string;
      description: string;
      resetStatus: boolean;
    }) => {
      const res = await fetch(`/api/crm/estimates/${id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, resetStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to duplicate estimate");
      }
      const body = await res.json();
      return body as { id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}

// ── save financials (recompute + persist) ─────────────────────────────────────

export function useSaveEstimateFinancials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      lineItems,
      directCosts,
      taxRateBps,
      overheadRateBps,
      discountCents,
      discountType,
      discountValue,
      appliedDiscountId,
      perTypeOverhead,
    }: {
      id: string;
      lineItems: EstimateLineItem[];
      directCosts: EstimateDirectCost[];
      taxRateBps: number;
      overheadRateBps: number;
      discountCents: number;
      discountType?: "percent" | "flat" | null;
      discountValue?: number | null;
      appliedDiscountId?: string | null;
      perTypeOverhead?: OverheadSettings;
    }) => {
      // Subtotal is net of each line's own discount; the document-level
      // discount is a separate reduction stacked on top of that.
      const subtotalCents = lineItems.reduce((s, li) => s + (li.totalCents - li.discountCents), 0);
      const totalCostCents = lineItems.reduce((s, li) => s + li.totalCostCents, 0);
      const directTotal = directCosts.reduce((s, dc) => s + dc.totalCents, 0);
      const revenueCents = subtotalCents - discountCents;
      const taxCents = Math.round((revenueCents * taxRateBps) / 10000);
      const totalCents = revenueCents + taxCents;
      let overheadCostCents: number;
      if (perTypeOverhead) {
        overheadCostCents = directCosts.reduce(
          (sum, dc) => sum + computeDirectCostOverhead(dc.costType, dc.totalCents, perTypeOverhead),
          0
        );
      } else {
        overheadCostCents = Math.round((totalCostCents * overheadRateBps) / 10000);
      }
      const grossProfitCents = revenueCents - totalCostCents - directTotal;
      const netProfitCents = grossProfitCents - overheadCostCents;
      const totalBudgetedHours = lineItems.reduce((s, li) => s + li.totalBudgetedHours, 0);

      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimates")
        .update({
          subtotal_cents: subtotalCents,
          discount_cents: discountCents,
          discount_type: discountType ?? null,
          discount_value: discountValue ?? null,
          applied_discount_id: appliedDiscountId ?? null,
          tax_rate_bps: taxRateBps,
          tax_cents: taxCents,
          total_cents: totalCents,
          revenue_cents: revenueCents,
          overhead_rate_bps: overheadRateBps,
          overhead_cost_cents: overheadCostCents,
          gross_profit_cents: grossProfitCents,
          net_profit_cents: netProfitCents,
          total_budgeted_hours: totalBudgetedHours,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimates", "detail", vars.id] });
      qc.invalidateQueries({ queryKey: ["estimates"] });
    },
  });
}

// ── AI draft line items ───────────────────────────────────────────────────────

export interface AIDraftLineItem {
  serviceName: string;
  serviceId: string | null;
  qty: number;
  rateCents: number;
  unitType: string;
  visits: number;
  estimateDesc: string;
}

export function useAIDraftLineItems() {
  return useMutation({
    mutationFn: async ({
      estimateId,
      prompt,
    }: {
      estimateId: string;
      prompt: string;
    }) => {
      const res = await fetch(`/api/crm/estimates/${estimateId}/ai-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "AI draft failed");
      }
      return res.json() as Promise<AIDraftLineItem[]>;
    },
  });
}

export interface EstimateVersion {
  id: string;
  versionNumber: number;
  sentToEmail: string | null;
  createdAt: string;
  snapshot: {
    estimateNumber: number;
    description: string | null;
    subtotalCents: number;
    taxCents: number;
    discountCents: number;
    totalCents: number;
    notes: string | null;
    validUntil: string | null;
    lineItems: {
      id: string;
      serviceName: string | null;
      qty: number;
      rateCents: number;
      visits: number;
      totalCents: number;
      unitType: string | null;
      estimateDesc: string | null;
      status: string;
      rowType: string;
      sectionName: string | null;
    }[];
  };
}

export function useEstimateVersions(estimateId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["estimate-versions", estimateId],
    queryFn: async (): Promise<EstimateVersion[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_versions")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        versionNumber: r.version_number as number,
        sentToEmail: r.sent_to_email as string | null,
        createdAt: r.created_at as string,
        snapshot: r.snapshot as EstimateVersion["snapshot"],
      }));
    },
    enabled: !!estimateId,
  });
}

export interface EstimateShareTokenInfo {
  id: string;
  token: string;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  acceptedAt: string | null;
  acceptedByName: string | null;
  expiresAt: string | null;
}

export function useEstimateShareTokens(estimateId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["estimate-share-tokens", estimateId],
    queryFn: async (): Promise<EstimateShareTokenInfo[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_share_tokens")
        .select("id, token, first_viewed_at, last_viewed_at, view_count, accepted_at, accepted_by_name, expires_at")
        .eq("estimate_id", estimateId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        token: r.token as string,
        firstViewedAt: r.first_viewed_at as string | null,
        lastViewedAt: r.last_viewed_at as string | null,
        viewCount: (r.view_count as number) ?? 0,
        acceptedAt: r.accepted_at as string | null,
        acceptedByName: r.accepted_by_name as string | null,
        expiresAt: r.expires_at as string | null,
      }));
    },
    enabled: !!estimateId,
  });
}

// ── change requests ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapChangeRequest(row: any): EstimateChangeRequest {
  return {
    id: row.id,
    orgId: row.org_id,
    estimateId: row.estimate_id,
    clientId: row.client_id,
    message: row.message,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
  };
}

export function useEstimateChangeRequests(estimateId: string) {
  return useQuery({
    queryKey: ["estimate-change-requests", estimateId],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estimate_change_requests")
        .select("*")
        .eq("estimate_id", estimateId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data.map(mapChangeRequest)) as EstimateChangeRequest[];
    },
    enabled: !!estimateId,
  });
}

export function useResolveChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, estimateId }: { id: string; estimateId: string }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("estimate_change_requests")
        .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: user?.id ?? null })
        .eq("id", id);
      if (error) throw error;
      return { estimateId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["estimate-change-requests", vars.estimateId] });
    },
  });
}
