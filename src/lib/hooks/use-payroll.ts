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
  /** Unpaid lunch deducted on top of the break; null = none. */
  lunchMinutes?: number | null;
  /** Extra worked time — counts toward overtime. */
  extraHours: number;
  /** Paid time off — paid, never overtime. */
  ptoHours: number;
  note: string | null;
  /** Add-time-entry: keep the day's existing PTO / extra hours / lunch / note. */
  keepExisting?: boolean;
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

/** Removes a member-day that shouldn't exist: its shift, job punches and adjustment. */
export function useDeletePayrollDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { crewMemberId: string; workDate: string }) => {
      const res = await fetch("/api/crm/reports/payroll", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof body?.error === "string" ? body.error : "Failed to delete the time entry");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-report"] });
      // Deleting a day recomputes visit labor server-side; refresh the hour views too.
      qc.invalidateQueries({ queryKey: ["job-visits"] });
      qc.invalidateQueries({ queryKey: ["crew-visits"] });
      qc.invalidateQueries({ queryKey: ["job-costing"] });
      toast.success("Time entry deleted");
    },
    onError: (err) => toast.error(err instanceof Error && err.message ? err.message : "Failed to delete the time entry"),
  });
}

export interface PayrollCrewMember { id: string; name: string; crewName?: string | null }

/** Everyone who can be given a manual entry: the active roster, by name. */
export function usePayrollCrewMembers() {
  return useQuery<PayrollCrewMember[]>({
    queryKey: ["payroll-crew-members"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any;
      const { data, error } = await supabase
        .from("crm_crew_members")
        .select("id, name, crew_id")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      // Crew names tell two people who share a name apart in the Add time entry picker.
      const { data: crews } = await supabase.from("crm_crews").select("id, name").is("deleted_at", null);
      const crewNameById = new Map<string, string>(((crews ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
      return ((data ?? []) as { id: string; name: string; crew_id: string | null }[]).map((m) => ({
        id: m.id,
        name: m.name,
        crewName: m.crew_id ? crewNameById.get(m.crew_id) ?? null : null,
      }));
    },
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
