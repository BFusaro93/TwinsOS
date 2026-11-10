import { allocatePoLine } from "@/lib/utils/project-po-allocation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapProject } from "@/lib/supabase/mappers";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import type { Project } from "@/types";

function patchProjectCache(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Project>) {
  // Patch all project list cache variants (includeArchived: true and false)
  for (const includeArchived of [true, false]) {
    queryClient.setQueryData<Project[]>(["projects", { includeArchived }], (old) =>
      old?.map((p) => p.id === id ? { ...p, ...patch } : p)
    );
  }
  // Also patch the single-project cache
  queryClient.setQueryData<Project>(["projects", id], (old) =>
    old ? { ...old, ...patch } : old
  );
}

/**
 * Embedded select that feeds computeProjectCostTotal — every PO / requisition
 * line, direct item and subcontract cost on a project, with the parent fields
 * the allocation needs.
 */
export const PROJECT_COST_SELECT = `
  *,
  po_line_items(quantity, unit_cost, total_cost, taxable, product_item_id, purchase_orders(tax_rate_percent, shipping_cost, subtotal, discount_cost, discount_reduces_tax, status, deleted_at, requisition_id, po_line_items(total_cost, taxable))),
  requisition_line_items(quantity, unit_cost, total_cost, product_item_id, requisition_id, requisitions(tax_rate_percent, status, converted_po_id, deleted_at)),
  project_direct_items(quantity, unit_cost, deleted_at),
  project_subcontract_costs(amount, deleted_at)
`;

/**
 * A project's material & other cost (cents): placed + pending POs after their
 * share of the PO discount, tax and shipping (allocatePoLine), requisitions not
 * yet on a PO, direct items and subcontract costs. The ONE calculation behind
 * the Projects list total, the Details tab's "Material & Other Costs" and the
 * Materials tab, and the same rules rpt_projects_wip uses (its cost to date +
 * committed). `row` is a projects row selected with PROJECT_COST_SELECT.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeProjectCostTotal(row: any): number {
  // Mirrors the Materials tab (ProjectDetailPanel) so the list total and the
  // Materials + Other Costs tabs on a project's detail view always agree —
  // both must include PO tax/shipping and pending (unconverted) REQ costs.
  // Exclude lines whose parent PO/Requisition was soft-deleted — a
  // canceled PO's cost must drop out of the project total, mirroring
  // ProjectDetailPanel's own totals (which source from usePurchaseOrders()/
  // useRequisitions(), both already filtered to deleted_at IS NULL).
  type PoRef = {
    tax_rate_percent: number; shipping_cost: number; subtotal: number;
    discount_cost: number | null; discount_reduces_tax: boolean | null;
    status: string; deleted_at: string | null; requisition_id: string | null;
    po_line_items: { total_cost: number; taxable: boolean | null }[] | null;
  };
  // Canceled/rejected POs never get spent, so they drop out too.
  const poLines: {
    quantity: number; unit_cost: number; total_cost: number; taxable: boolean | null;
    product_item_id: string | null;
    purchase_orders: PoRef | null;
  }[] = (row.po_line_items ?? []).filter(
    (li: { purchase_orders: PoRef | null }) =>
      !li.purchase_orders?.deleted_at &&
      li.purchase_orders?.status !== "canceled" &&
      li.purchase_orders?.status !== "rejected" &&
      // A draft PO isn't committed spend: the WIP report (rpt_projects_wip) leaves it out too.
      li.purchase_orders?.status !== "draft"
  );
  // Rejected/closed requisitions are dead — no pending cost.
  const reqLines: {
    quantity: number; unit_cost: number; total_cost: number;
    product_item_id: string | null; requisition_id: string;
    requisitions: { tax_rate_percent: number; status: string; converted_po_id: string | null; deleted_at: string | null } | null;
  }[] = (row.requisition_line_items ?? []).filter(
    (li: { requisitions: { deleted_at: string | null; status: string } | null }) =>
      !li.requisitions?.deleted_at &&
      li.requisitions?.status !== "rejected" &&
      li.requisitions?.status !== "closed" &&
      li.requisitions?.status !== "draft"
  );
  const directItems: { quantity: number; unit_cost: number; deleted_at: string | null }[] =
    row.project_direct_items ?? [];
  const subcontractCosts: { amount: number; deleted_at: string | null }[] =
    row.project_subcontract_costs ?? [];

  // Per-line share of the PO's tax, shipping and discount — same
  // allocation ProjectDetailPanel uses.
  let poTax = 0;
  let poShipping = 0;
  let poDiscount = 0;
  for (const li of poLines) {
    const po = li.purchase_orders;
    if (!po) continue;
    const siblings = po.po_line_items ?? [];
    const poSubtotal = siblings.length > 0
      ? siblings.reduce((sum, l) => sum + (l.total_cost ?? 0), 0)
      : po.subtotal;
    const poTaxableSubtotal = siblings.length > 0
      ? siblings.filter((l) => l.taxable !== false).reduce((sum, l) => sum + (l.total_cost ?? 0), 0)
      : poSubtotal;
    const a = allocatePoLine(li.total_cost ?? 0, li.taxable !== false, {
      poSubtotal,
      poTaxableSubtotal,
      taxRatePercent: po.tax_rate_percent,
      shippingCost: po.shipping_cost,
      discountCost: po.discount_cost ?? 0,
      discountReducesTax: po.discount_reduces_tax ?? false,
    });
    poTax += a.tax;
    poShipping += a.shipping;
    poDiscount += a.discount;
  }
  const lineItemTotal = poLines.reduce((sum, li) => sum + (li.total_cost ?? 0), 0);

  // Skip REQ line items whose requisition was already converted to a PO —
  // that cost is already counted via po_line_items above. A requisition split
  // by vendor stays approved until every vendor's PO exists, so also skip a
  // line once a PO from that requisition carries the same product here
  // (same rule as rpt_projects_wip).
  const splitKeys = new Set(
    poLines
      .filter((li) => li.purchase_orders?.requisition_id)
      .map((li) => `${li.purchase_orders!.requisition_id}:${li.product_item_id ?? ""}`)
  );
  const pendingReqLines = reqLines.filter(
    (li) =>
      !(li.requisitions?.status === "ordered" && li.requisitions?.converted_po_id) &&
      !splitKeys.has(`${li.requisition_id}:${li.product_item_id ?? ""}`)
  );
  const reqTotal = pendingReqLines.reduce((sum, li) => sum + (li.total_cost ?? 0), 0);
  const reqTax = pendingReqLines.reduce((sum, li) => {
    const rate = li.requisitions?.tax_rate_percent ?? 0;
    return sum + Math.round((li.total_cost ?? 0) * rate / 100);
  }, 0);

  const directItemTotal = directItems
    .filter((d) => !d.deleted_at)
    .reduce((sum, d) => sum + Math.round(Number(d.quantity) * d.unit_cost), 0);
  const subcontractTotal = subcontractCosts
    .filter((c) => !c.deleted_at)
    .reduce((sum, c) => sum + (c.amount ?? 0), 0);

  return lineItemTotal - poDiscount + poTax + poShipping + reqTotal + reqTax + directItemTotal + subcontractTotal;
}

/** Returns all non-deleted projects. Pass includeArchived=true to include archived ones (e.g. for admin views). */
export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ["projects", { includeArchived }],
    queryFn: async () => {
      const supabase = createClient();
      // Paged: a bare select stops at PostgREST's 1000-row cap, so past 1000 rows the oldest silently vanish from the list.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await fetchAllRows<any>(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q = (supabase as any)
          .from("projects")
          .select(PROJECT_COST_SELECT)
          .is("deleted_at", null)
          .order("name");
        if (!includeArchived) q = q.eq("is_archived", false);
        return q;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((row: any) => mapProject({ ...row, total_cost: computeProjectCostTotal(row) })) as Project[];
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    enabled: !!id,
  });
}

/**
 * One project's material & other cost — computeProjectCostTotal, the same
 * figure as the Projects list. Under ["projects", id, ...] so every project
 * invalidation refreshes it.
 */
export function useProjectCostTotal(projectId: string | null | undefined, version?: string | number) {
  return useQuery({
    // `version`: callers that already watch the project's POs / requisitions /
    // costs pass their update stamps, so the total refetches when any changes.
    queryKey: ["projects", projectId, "cost-total", version ?? null],
    enabled: !!projectId,
    placeholderData: (prev: number | undefined) => prev,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("projects")
        .select(PROJECT_COST_SELECT)
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data ? computeProjectCostTotal(data) : 0;
    },
  });
}

export interface ProjectWipRow {
  costToDateCents: number;
  materialCostCents: number;
  laborHours: number;
  laborCostCents: number;
  overheadCostCents: number;
  billedCents: number;
}

/**
 * The project's row in rpt_projects_wip — the WIP report's own figures, so the
 * project tabs and the report always agree: labor = crew hours on completed
 * visits + manual hours × the project's locked LLR, overhead at the estimate's
 * overhead share, billed = pre-tax via rpt_invoice_link_billing.
 */
export function useProjectWip(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "wip"],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectWipRow | null> => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("rpt_projects_wip")
        .select("cost_to_date_cents, material_cost_cents, labor_hours, labor_cost_cents, overhead_cost_cents, billed_cents")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        costToDateCents: Number(data.cost_to_date_cents ?? 0),
        materialCostCents: Number(data.material_cost_cents ?? 0),
        laborHours: Number(data.labor_hours ?? 0),
        laborCostCents: Number(data.labor_cost_cents ?? 0),
        overheadCostCents: Number(data.overhead_cost_cents ?? 0),
        billedCents: Number(data.billed_cents ?? 0),
      };
    },
  });
}

export interface ProjectConsolidatedSource {
  /** The project's own invoice, now merged/consolidated into another. */
  invoiceId: string;
  /** The invoice that carries its charge. */
  billedInvoiceId: string;
  billedInvoiceNumber: number | null;
  billedInvoiceStatus: string | null;
  invoiceDate: string;
  revenueExTaxCents: number;
}

/**
 * The project's billing as rpt_invoice_link_billing counts it (the WIP report's
 * billed_cents): issued invoices pre-tax, with a consolidated source counted on
 * its own project at the date of the invoice that carries it.
 * `consolidatedSources` are the rows the project's invoice list can't show (the
 * source invoice is voided into its parent).
 */
export function useProjectLinkBilling(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["projects", projectId, "link-billing"],
    enabled: !!projectId,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("rpt_invoice_link_billing")
        .select("invoice_id, billed_invoice_id, invoice_date, revenue_ex_tax_cents, is_consolidated_source")
        .eq("project_id", projectId);
      if (error) throw error;
      const rows = (data ?? []) as {
        invoice_id: string; billed_invoice_id: string; invoice_date: string;
        revenue_ex_tax_cents: number | string | null; is_consolidated_source: boolean;
      }[];
      const billedExTaxCents = rows.reduce((s, r) => s + Number(r.revenue_ex_tax_cents ?? 0), 0);
      const sources = rows.filter((r) => r.is_consolidated_source);
      const parentIds = [...new Set(sources.map((r) => r.billed_invoice_id))];
      const parents = new Map<string, { invoice_number: number | null; status: string | null }>();
      if (parentIds.length > 0) {
        const { data: inv, error: invErr } = await db
          .from("crm_invoices")
          .select("id, invoice_number, status")
          .in("id", parentIds);
        if (invErr) throw invErr;
        for (const i of (inv ?? []) as { id: string; invoice_number: number | null; status: string | null }[]) {
          parents.set(i.id, { invoice_number: i.invoice_number, status: i.status });
        }
      }
      const consolidatedSources: ProjectConsolidatedSource[] = sources.map((r) => ({
        invoiceId: r.invoice_id,
        billedInvoiceId: r.billed_invoice_id,
        billedInvoiceNumber: parents.get(r.billed_invoice_id)?.invoice_number ?? null,
        billedInvoiceStatus: parents.get(r.billed_invoice_id)?.status ?? null,
        invoiceDate: r.invoice_date,
        revenueExTaxCents: Number(r.revenue_ex_tax_cents ?? 0),
      }));
      return { billedExTaxCents, consolidatedSources };
    },
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      // originalContractPrice is excluded: callers pass `contractPrice`, which
      // this hook writes to original_contract_price. The revised contract_price
      // is derived by a DB trigger and is never an input.
      input: Omit<Project, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt" | "totalCost" | "isArchived" | "progressPct" | "clientId" | "clientName" | "estimatedCostCents" | "originalContractPrice"> & { clientId?: string | null; progressPct?: number; estimatedCostCents?: number }
    ) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("projects")
        .insert({
          created_by: user?.id ?? null,
          name: input.name,
          customer_name: input.customerName,
          address: input.address,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.city  !== undefined && { city:  (input as any).city  }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.state !== undefined && { state: (input as any).state }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.zip   !== undefined && { zip:   (input as any).zip   }),
          status: input.status,
          start_date: input.startDate || null,
          end_date: input.endDate,
          original_contract_price: input.contractPrice ?? 0,
          estimated_cost_cents: input.estimatedCostCents ?? 0,
          labor_hours: input.laborHours ?? null,
          budget_hours: input.budgetHours ?? null,
          labor_rate_cents: input.laborRateCents ?? null,
          burdened_rate_cents: input.burdenedRateCents ?? null,
          notes: input.notes,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.clientId !== undefined && { client_id: (input as any).clientId }),
        })
        .select()
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["client-projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Project> & { id: string }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("projects")
        .update({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.customerName !== undefined && { customer_name: input.customerName }),
          ...(input.address !== undefined && { address: input.address }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.city  !== undefined && { city:  (input as any).city  }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.state !== undefined && { state: (input as any).state }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(input.zip   !== undefined && { zip:   (input as any).zip   }),
          ...(input.status !== undefined && { status: input.status }),
          ...(input.startDate !== undefined && { start_date: input.startDate || null }),
          ...(input.endDate !== undefined && { end_date: input.endDate }),
          ...(input.contractPrice !== undefined && { original_contract_price: input.contractPrice }),
          ...(input.estimatedCostCents !== undefined && { estimated_cost_cents: input.estimatedCostCents }),
          ...(input.laborHours !== undefined && { labor_hours: input.laborHours }),
          ...(input.budgetHours !== undefined && { budget_hours: input.budgetHours }),
          ...(input.laborRateCents !== undefined && { labor_rate_cents: input.laborRateCents }),
          ...(input.burdenedRateCents !== undefined && { burdened_rate_cents: input.burdenedRateCents }),
          ...(input.notes !== undefined && { notes: input.notes }),
          ...(input.clientId !== undefined && { client_id: input.clientId }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return mapProject(data);
    },
    onMutate: async ({ id, status, name, customerName, address, startDate, endDate, contractPrice, estimatedCostCents, laborHours, budgetHours, laborRateCents, burdenedRateCents, notes, clientId }) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      // The list lives under ["projects", { includeArchived }]; snapshot every variant so the
      // rollback restores what the optimistic patch changed (["projects"] alone never existed).
      const previous = queryClient.getQueriesData<Project[]>({ queryKey: ["projects"] });
      const patch: Partial<Project> = {};
      if (status !== undefined) patch.status = status;
      if (name !== undefined) patch.name = name;
      if (customerName !== undefined) patch.customerName = customerName;
      if (address !== undefined) patch.address = address;
      if (startDate !== undefined) patch.startDate = startDate ?? null;
      if (endDate !== undefined) patch.endDate = endDate;
      // contract_price is derived (original + approved COs) and recomputed by a
      // DB trigger, so the optimistic patch can only safely move the original;
      // the refetch brings back the true revised figure.
      if (contractPrice !== undefined) patch.originalContractPrice = contractPrice;
      if (estimatedCostCents !== undefined) patch.estimatedCostCents = estimatedCostCents;
      if (laborHours !== undefined) patch.laborHours = laborHours;
      if (budgetHours !== undefined) patch.budgetHours = budgetHours;
      if (laborRateCents !== undefined) patch.laborRateCents = laborRateCents;
      if (burdenedRateCents !== undefined) patch.burdenedRateCents = burdenedRateCents;
      if (notes !== undefined) patch.notes = notes;
      if (clientId !== undefined) patch.clientId = clientId;
      patchProjectCache(queryClient, id, patch);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
      // A DB trigger starts a project's pending warranties when it flips to complete.
      queryClient.invalidateQueries({ queryKey: ["crm-warranties"] });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

/** Toggle is_archived on a project. Archived projects are hidden from lists and dropdowns. */
export function useArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const supabase = createClient();
      // is_archived not in generated types yet — use type cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("projects")
        .update({ is_archived: archived, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { id, archived }) => {
      patchProjectCache(queryClient, id, { isArchived: archived });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
