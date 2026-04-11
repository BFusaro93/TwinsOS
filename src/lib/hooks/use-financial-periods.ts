import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FinancialPeriodRecord {
  id: string;
  periodMonth: string; // "YYYY-MM-DD" (first day of month)
  data: FinancialPeriodData;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialPeriodData {
  // Income Statement
  revenue: number;              // total revenue (cents)
  cogs: number;                 // cost of goods sold (cents)
  gross_profit: number;         // derived: revenue - cogs
  operating_expenses: OperatingExpenses;
  ebitda: number;               // gross_profit - total opex
  depreciation: number;         // (cents)
  net_income: number;           // ebitda - depreciation - interest - taxes

  // Cash Flow
  cash_operating: number;       // operating cash flow (cents)
  cash_investing: number;       // investing cash flow (cents, usually negative)
  cash_financing: number;       // financing cash flow (cents)

  notes: string;
}

export interface OperatingExpenses {
  payroll: number;
  equipment: number;
  fuel: number;
  insurance: number;
  marketing: number;
  rent: number;
  utilities: number;
  other: number;
}

export const EMPTY_OPEX: OperatingExpenses = {
  payroll: 0,
  equipment: 0,
  fuel: 0,
  insurance: 0,
  marketing: 0,
  rent: 0,
  utilities: 0,
  other: 0,
};

export const EMPTY_DATA: FinancialPeriodData = {
  revenue: 0,
  cogs: 0,
  gross_profit: 0,
  operating_expenses: { ...EMPTY_OPEX },
  ebitda: 0,
  depreciation: 0,
  net_income: 0,
  cash_operating: 0,
  cash_investing: 0,
  cash_financing: 0,
  notes: "",
};

export function totalOpex(opex: OperatingExpenses): number {
  return Object.values(opex).reduce((s, v) => s + (v ?? 0), 0);
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: {
  id: string;
  period_month: string;
  data: unknown;
  created_at: string;
  updated_at: string;
}): FinancialPeriodRecord {
  return {
    id: row.id,
    periodMonth: row.period_month,
    data: row.data as FinancialPeriodData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useFinancialPeriods() {
  return useQuery<FinancialPeriodRecord[]>({
    queryKey: ["financial-periods"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("financial_periods")
        .select("id, period_month, data, created_at, updated_at")
        .order("period_month", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useUpsertFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      periodMonth,
      data,
    }: {
      periodMonth: string; // "YYYY-MM-DD"
      data: FinancialPeriodData;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      const orgId = profile?.org_id;
      if (!orgId) throw new Error("No org found for user");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("financial_periods")
        .upsert(
          { org_id: orgId, period_month: periodMonth, data },
          { onConflict: "org_id,period_month" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial-periods"] }),
  });
}

export function useDeleteFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("financial_periods")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial-periods"] }),
  });
}
