"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import type {
  CommissionAssignment,
  CommissionSaleType,
  CommissionEarnedOn,
  CommissionLine,
  CommissionPendingAdjustment,
  CommissionPlan,
  CommissionStatement,
  CommissionStatementLine,
  CommissionStatementStatus,
} from "@/types/crm-commissions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any;

// ── plans & rules ─────────────────────────────────────────────────────────────

function scopeRank(r: { serviceId: string | null; category: string | null }) {
  return r.serviceId ? 2 : r.category ? 1 : 0;
}

export function useCommissionPlans() {
  return useQuery<CommissionPlan[]>({
    queryKey: ["commission-plans"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("crm_commission_plans")
        .select("*, crm_commission_plan_rules(*)")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((p: any): CommissionPlan => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        isActive: p.is_active,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rules: ((p.crm_commission_plan_rules ?? []) as any[])
          .filter((r) => !r.deleted_at)
          .map((r) => ({
            id: r.id,
            planId: r.plan_id,
            serviceId: r.service_id ?? null,
            category: r.category ?? null,
            saleType: r.sale_type as CommissionSaleType,
            earnedOn: r.earned_on as CommissionEarnedOn,
            rateBps: r.rate_bps,
          }))
          .sort((a, b) => scopeRank(b) - scopeRank(a) || (a.category ?? "").localeCompare(b.category ?? "")),
      }));
    },
  });
}

function useInvalidating<TVars>(fn: (v: TVars) => Promise<void>, keys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
}

export function useSaveCommissionPlan() {
  return useInvalidating(
    async (v: { id?: string; name: string; description: string | null; isActive: boolean }) => {
      const row = { name: v.name.trim(), description: v.description?.trim() || null, is_active: v.isActive };
      const { error } = v.id
        ? await db().from("crm_commission_plans").update(row).eq("id", v.id)
        : await db().from("crm_commission_plans").insert(row);
      if (error) throw error;
    },
    [["commission-plans"], ["commission-lines"]],
  );
}

export function useDeleteCommissionPlan() {
  return useInvalidating(
    async (id: string) => {
      const { error } = await db().from("crm_commission_plans").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    [["commission-plans"], ["commission-assignments"], ["commission-lines"]],
  );
}

export function useSaveCommissionRule() {
  return useInvalidating(
    async (v: {
      planId: string;
      serviceId: string | null;
      category: string | null;
      saleType: CommissionSaleType;
      earnedOn: CommissionEarnedOn;
      rateBps: number;
    }) => {
      // One live rule per (plan, scope, sale type, earned-on): update it if present.
      let q = db()
        .from("crm_commission_plan_rules")
        .select("id")
        .eq("plan_id", v.planId)
        .eq("sale_type", v.saleType)
        .eq("earned_on", v.earnedOn)
        .is("deleted_at", null);
      q = v.serviceId ? q.eq("service_id", v.serviceId) : q.is("service_id", null);
      q = v.category && !v.serviceId ? q.ilike("category", v.category) : q.is("category", null);
      const { data: existing, error: findErr } = await q.maybeSingle();
      if (findErr) throw findErr;
      const { error } = existing
        ? await db().from("crm_commission_plan_rules").update({ rate_bps: v.rateBps }).eq("id", existing.id)
        : await db().from("crm_commission_plan_rules").insert({
            plan_id: v.planId,
            service_id: v.serviceId,
            category: v.serviceId ? null : v.category,
            sale_type: v.saleType,
            earned_on: v.earnedOn,
            rate_bps: v.rateBps,
          });
      if (error) throw error;
    },
    [["commission-plans"], ["commission-lines"]],
  );
}

export function useDeleteCommissionRule() {
  return useInvalidating(
    async (id: string) => {
      const { error } = await db().from("crm_commission_plan_rules").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    [["commission-plans"], ["commission-lines"]],
  );
}

// ── assignments ───────────────────────────────────────────────────────────────

export function useCommissionAssignments() {
  return useQuery<CommissionAssignment[]>({
    queryKey: ["commission-assignments"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("crm_commission_assignments")
        .select("*")
        .is("deleted_at", null)
        .order("effective_from", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((a: any): CommissionAssignment => ({
        id: a.id,
        employeeId: a.employee_id,
        planId: a.plan_id,
        effectiveFrom: a.effective_from,
        effectiveTo: a.effective_to ?? null,
      }));
    },
  });
}

export function useAddCommissionAssignment() {
  return useInvalidating(
    async (v: { employeeId: string; planId: string; effectiveFrom: string }) => {
      const { error } = await db().from("crm_commission_assignments").insert({
        employee_id: v.employeeId, plan_id: v.planId, effective_from: v.effectiveFrom,
      });
      if (error) throw error;
    },
    [["commission-assignments"], ["commission-lines"]],
  );
}

export function useEndCommissionAssignment() {
  return useInvalidating(
    async (v: { id: string; effectiveTo: string }) => {
      const { error } = await db().from("crm_commission_assignments").update({ effective_to: v.effectiveTo }).eq("id", v.id);
      if (error) throw error;
    },
    [["commission-assignments"], ["commission-lines"]],
  );
}

export function useDeleteCommissionAssignment() {
  return useInvalidating(
    async (id: string) => {
      const { error } = await db().from("crm_commission_assignments").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    [["commission-assignments"], ["commission-lines"]],
  );
}

// ── earnings ──────────────────────────────────────────────────────────────────

export function useCommissionLines(from: string, to: string, employeeId?: string) {
  return useQuery<CommissionLine[]>({
    queryKey: ["commission-lines", from, to, employeeId ?? null],
    queryFn: async () => {
      const { data, error } = await db().rpc("crm_commission_lines", {
        p_from: from,
        p_to: to,
        p_employee_id: employeeId ?? null,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any): CommissionLine => ({
        evKey: r.ev_key,
        employeeId: r.employee_id,
        employeeName: r.employee_name,
        planId: r.plan_id,
        planName: r.plan_name,
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number ?? null,
        clientId: r.client_id,
        clientName: r.client_name ?? null,
        serviceName: r.service_name ?? null,
        category: r.category ?? null,
        saleType: r.sale_type,
        earnedOn: r.earned_on,
        eventDate: r.event_date,
        basisCents: r.basis_cents,
        rateBps: r.rate_bps,
        commissionCents: r.commission_cents,
        statementId: r.statement_id ?? null,
      }));
    },
    enabled: !!from && !!to && to >= from,
  });
}

// ── statements ────────────────────────────────────────────────────────────────

export function useCommissionStatements() {
  return useQuery<CommissionStatement[]>({
    queryKey: ["commission-statements"],
    queryFn: async () => {
      const { data, error } = await db()
        .from("crm_commission_statements")
        .select("*, crm_employees(first_name, last_name)")
        .order("period_end", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((s: any): CommissionStatement => ({
        id: s.id,
        employeeId: s.employee_id,
        employeeName: s.crm_employees ? `${s.crm_employees.first_name} ${s.crm_employees.last_name}` : "—",
        periodStart: s.period_start,
        periodEnd: s.period_end,
        status: s.status,
        totalBasisCents: s.total_basis_cents,
        totalCommissionCents: s.total_commission_cents,
        approvedAt: s.approved_at ?? null,
        paidAt: s.paid_at ?? null,
        notes: s.notes ?? null,
      }));
    },
  });
}

export function useCommissionStatementLines(statementId: string | null) {
  return useQuery<CommissionStatementLine[]>({
    queryKey: ["commission-statement-lines", statementId],
    queryFn: async () => {
      const { data, error } = await db()
        .from("crm_commission_statement_lines")
        .select("*")
        .eq("statement_id", statementId)
        .order("event_date");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((l: any): CommissionStatementLine => ({
        id: l.id,
        invoiceNumber: l.invoice_number ?? null,
        clientName: l.client_name ?? null,
        planName: l.plan_name ?? null,
        serviceName: l.service_name ?? null,
        category: l.category ?? null,
        saleType: l.sale_type ?? null,
        earnedOn: l.earned_on ?? null,
        eventDate: l.event_date ?? null,
        basisCents: l.basis_cents,
        rateBps: l.rate_bps,
        commissionCents: l.commission_cents,
        sourceEvKey: l.source_ev_key ?? null,
        invoiceId: l.invoice_id ?? null,
      }));
    },
    enabled: !!statementId,
  });
}

/**
 * Clawback / offset adjustments the next statement will carry, for one rep or
 * (employeeId omitted) every rep the caller may see. Not tied to any period.
 */
export function useCommissionPendingAdjustments(employeeId?: string) {
  return useQuery<CommissionPendingAdjustment[]>({
    queryKey: ["commission-pending-adjustments", employeeId ?? null],
    queryFn: async () => {
      const { data, error } = await db().rpc("crm_commission_pending_clawbacks", {
        p_employee_id: employeeId ?? null,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any): CommissionPendingAdjustment => ({
        clawEvKey: r.claw_ev_key,
        sourceEvKey: r.source_ev_key,
        employeeId: r.employee_id,
        invoiceId: r.invoice_id ?? null,
        invoiceNumber: r.invoice_number ?? null,
        clientName: r.client_name ?? null,
        planName: r.plan_name ?? null,
        serviceName: r.service_name ?? null,
        basisCents: r.basis_cents,
        rateBps: r.rate_bps,
        commissionCents: r.commission_cents,
      }));
    },
  });
}

export function useCreateCommissionStatement() {
  return useInvalidating(
    async (v: { employeeId: string; from: string; to: string }) => {
      const { error } = await db().rpc("crm_commission_create_statement", {
        p_employee_id: v.employeeId, p_from: v.from, p_to: v.to,
      });
      if (error) throw error;
    },
    [["commission-statements"], ["commission-lines"], ["commission-pending-adjustments"]],
  );
}

export function useSetCommissionStatementStatus() {
  return useInvalidating(
    async (v: { id: string; status: Extract<CommissionStatementStatus, "approved" | "paid"> }) => {
      const now = new Date().toISOString();
      const patch = v.status === "approved" ? { status: "approved", approved_at: now } : { status: "paid", paid_at: now };
      const { error } = await db().from("crm_commission_statements").update(patch).eq("id", v.id);
      if (error) throw error;
    },
    [["commission-statements"]],
  );
}

export function useVoidCommissionStatement() {
  return useInvalidating(
    async (id: string) => {
      const { error } = await db().rpc("crm_commission_void_statement", { p_statement_id: id });
      if (error) throw error;
    },
    [["commission-statements"], ["commission-lines"], ["commission-pending-adjustments"]],
  );
}
