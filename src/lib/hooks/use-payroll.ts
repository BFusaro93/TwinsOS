"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQuery } from "@/lib/hooks/use-query";
import type { PayrollRow } from "@/lib/payroll/compute";

export type { PayrollRow };

export class PayrollForbiddenError extends Error {}

export function usePayroll(from: string, to: string) {
  return useQuery<PayrollRow[]>({
    queryKey: ["payroll-report", from, to],
    enabled: !!from && !!to && from <= to,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/crm/reports/payroll?from=${from}&to=${to}`);
      if (res.status === 403) throw new PayrollForbiddenError("forbidden");
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { rows: PayrollRow[] };
      return json.rows;
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
  extraHours: number;
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
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-report"] }),
    onError: () => toast.error("Failed to save payroll adjustment"),
  });
}
