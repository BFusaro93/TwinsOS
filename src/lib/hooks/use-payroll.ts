"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";
import type { PayrollRow } from "@/lib/payroll/compute";
import type { OvertimeRule } from "@/lib/payroll/overtime";

export type { PayrollRow, OvertimeRule };

export class PayrollForbiddenError extends Error {}

export interface PayrollReportData {
  rows: PayrollRow[];
  /** The org's overtime rule the rows' regular / overtime hours were split by. */
  overtime: OvertimeRule;
}

export function usePayroll(from: string, to: string) {
  return useQuery<PayrollReportData>({
    queryKey: ["payroll-report", from, to],
    enabled: !!from && !!to && from <= to,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/crm/reports/payroll?from=${from}&to=${to}`);
      if (res.status === 403) throw new PayrollForbiddenError("forbidden");
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as PayrollReportData;
      return { rows: json.rows, overtime: json.overtime };
    },
  });
}

export interface PayrollAdjustmentInput {
  crewMemberId: string;
  workDate: string;
  hoursOverride: number | null;
  startTime: string | null;
  endTime: string | null;
  breakMinutes: number | null;
  /** Extra worked time — counts toward overtime. */
  extraHours: number;
  /** Paid time off — paid, never overtime. */
  ptoHours: number;
  note: string | null;
}

export function useSavePayrollAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PayrollAdjustmentInput) => {
      const res = await fetch("/api/crm/reports/payroll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        // The server's own sentence when it has one ("Payroll is locked through ...").
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to save payroll adjustment");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-report"] }),
    onError: (err) => toast.error(err instanceof Error && err.message ? err.message : "Failed to save payroll adjustment"),
  });
}

const PAYROLL_LOCK_KEY = ["payroll-lock"] as const;

/**
 * organizations.payroll_locked_through — shifts, punches and payroll
 * adjustments dated on or before it can't be changed by anyone (enforced in
 * the database). Null = nothing locked.
 */
export function usePayrollLock() {
  const qc = useQueryClient();
  return useQuery<string | null>({
    queryKey: PAYROLL_LOCK_KEY,
    queryFn: async () => {
      const profile = await fetchCurrentProfile(qc);
      if (!profile) return null;
      const { data, error } = await createClient()
        .from("organizations")
        .select("payroll_locked_through")
        .eq("id", profile.orgId)
        .maybeSingle();
      if (error) throw error;
      return ((data as { payroll_locked_through?: string | null } | null)?.payroll_locked_through) ?? null;
    },
  });
}

/** Admins only (the database refuses anyone else, and any date that isn't before today). */
export function useSetPayrollLock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lockedThrough: string | null) => {
      const profile = await fetchCurrentProfile(qc);
      if (!profile) throw new Error("Not signed in");
      const { data, error } = await createClient()
        .from("organizations")
        .update({ payroll_locked_through: lockedThrough } as never)
        .eq("id", profile.orgId)
        .select("payroll_locked_through");
      if (error) throw new Error(error.message);
      // RLS hides the row from someone who can't edit org settings: 0 rows, no error.
      if (!data || data.length === 0) throw new Error("Only an admin can change the payroll lock date.");
      return lockedThrough;
    },
    onSuccess: (lockedThrough) => {
      qc.setQueryData(PAYROLL_LOCK_KEY, lockedThrough);
      qc.invalidateQueries({ queryKey: ["payroll-report"] });
      toast.success(lockedThrough ? "Payroll lock date saved" : "Payroll unlocked");
    },
    onError: (err) => toast.error(err instanceof Error && err.message ? err.message : "Failed to save the payroll lock date"),
  });
}
