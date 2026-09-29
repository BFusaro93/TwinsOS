import { allocatePoLine } from "@/lib/utils/project-po-allocation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { mapProject } from "@/lib/supabase/mappers";
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

/** Returns all non-deleted projects. Pass includeArchived=true to include archived ones (e.g. for admin views). */
export function useProjects(includeArchived = false) {
  return useQuery({
    queryKey: ["projects", { includeArchived }],
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("projects")
        .select(`
          *,
          po_line_items(quantity, unit_cost, total_cost, taxable, purchase_orders(tax_rate_percent, shipping_cost, subtotal, discount_cost, discount_reduces_tax, status, deleted_at, po_line_items(total_cost, taxable))),
          requisition_line_items(quantity, unit_cost, total_cost, requisitions(tax_rate_percent, status, converted_po_id, deleted_at)),
          project_direct_items(quantity, unit_cost, deleted_at),
          project_subcontract_costs(amount, deleted_at)
        `)
        .is("deleted_at", null)
        .order("name");
      if (!includeArchived) q = q.eq("is_archived", false);
      const { data, error } = await q;
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return data.map((row: any) => {
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
          status: string; deleted_at: string | null;
          po_line_items: { total_cost: number; taxable: boolean | null }[] | null;
        };
        // Canceled/rejected POs never get spent, so they drop out too.
        const poLines: {
          quantity: number; unit_cost: number; total_cost: number; taxable: boolean | null;
          purchase_orders: PoRef | null;
        }[] = (row.po_line_items ?? []).filter(
          (li: { purchase_orders: PoRef | null }) =>
            !li.purchase_orders?.deleted_at &&
            li.purchase_orders?.status !== "canceled" &&
            li.purchase_orders?.status !== "rejected"
        );
        // Rejected/closed requisitions are dead — no pending cost.
        const reqLines: {
          quantity: number; unit_cost: number; total_cost: number;
          requisitions: { tax_rate_percent: number; status: string; converted_po_id: string | null; deleted_at: string | null } | null;
        }[] = (row.requisition_line_items ?? []).filter(
          (li: { requisitions: { deleted_at: string | null; status: string } | null }) =>
            !li.requisitions?.deleted_at &&
            li.requisitions?.status !== "rejected" &&
            li.requisitions?.status !== "closed"
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
        // that cost is already counted via po_line_items above.
        const pendingReqLines = reqLines.filter(
          (li) => !(li.requisitions?.status === "ordered" && li.requisitions?.converted_po_id)
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

        const computedTotal =
          lineItemTotal - poDiscount + poTax + poShipping + reqTotal + reqTax + directItemTotal + subcontractTotal;
        return mapProject({ ...row, total_cost: computedTotal });
      }) as Project[];
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
      const previous = queryClient.getQueryData<Project[]>(["projects"]);
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
      if (context?.previous) {
        queryClient.setQueryData<Project[]>(["projects"], context.previous);
      }
    },
    onSettled: (_, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
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
