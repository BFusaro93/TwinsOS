import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RecordType = "actual" | "budget" | "ytd_actual";

export interface FinancialPeriodRecord {
  id: string;
  periodMonth: string; // "YYYY-MM-DD" (first day of month)
  recordType: RecordType;
  data: FinancialPeriodData;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialPeriodData {
  // Income Statement
  revenue: number;                // total revenue (cents)
  cogs: number;                   // cost of goods sold (cents)
  gross_profit: number;           // derived: revenue - cogs
  operating_expenses: OperatingExpenses;
  net_operating_income: number;   // gross_profit - totalOpex (NOI)

  // Below-the-line add-backs for EBITDA
  interest: number;               // interest expense (cents)
  taxes: number;                  // income taxes (cents)
  guaranteed_payments: number;    // owner guaranteed payments (cents)
  depreciation: number;           // D&A (cents)

  // Adj. EBITDA = net_income + interest + depreciation + taxes + guaranteed_payments
  ebitda: number;

  net_income: number;             // bottom-line net income (cents)

  // Cash Flow
  cash_operating: number;         // operating cash flow (cents)
  cash_investing: number;         // investing cash flow (cents, usually negative)
  cash_financing: number;         // financing cash flow (cents)

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
  net_operating_income: 0,
  interest: 0,
  taxes: 0,
  guaranteed_payments: 0,
  depreciation: 0,
  ebitda: 0,
  net_income: 0,
  cash_operating: 0,
  cash_investing: 0,
  cash_financing: 0,
  notes: "",
};

export function totalOpex(opex: OperatingExpenses): number {
  return Object.values(opex).reduce((s, v) => s + (v ?? 0), 0);
}

/** NOI = Gross Profit − Total OpEx */
export function computeNOI(d: FinancialPeriodData): number {
  if (d.net_operating_income !== undefined && d.net_operating_income !== 0) return d.net_operating_income;
  return d.gross_profit - totalOpex(d.operating_expenses);
}

/** Adjusted EBITDA = Net Income + Interest + Depreciation + Taxes + Guaranteed Payments */
export function computeEbitda(d: FinancialPeriodData): number {
  if (d.ebitda !== undefined && d.ebitda !== 0) return d.ebitda;
  return d.net_income + (d.interest ?? 0) + (d.depreciation ?? 0) + (d.taxes ?? 0) + (d.guaranteed_payments ?? 0);
}

// ── Derived calculations ───────────────────────────────────────────────────────

export function recompute(d: FinancialPeriodData): FinancialPeriodData {
  const gross_profit = d.revenue - d.cogs;
  const net_operating_income = gross_profit - totalOpex(d.operating_expenses);
  const net_income = net_operating_income - d.interest - d.taxes - d.depreciation - d.guaranteed_payments;
  const ebitda = net_income + d.interest + d.depreciation + d.taxes + d.guaranteed_payments;
  return { ...d, gross_profit, net_operating_income, net_income, ebitda };
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: {
  id: string;
  period_month: string;
  record_type: string;
  data: unknown;
  created_at: string;
  updated_at: string;
}): FinancialPeriodRecord {
  return {
    id: row.id,
    periodMonth: row.period_month,
    recordType: row.record_type as RecordType,
    data: row.data as FinancialPeriodData,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Query key factory ─────────────────────────────────────────────────────────

const keys = {
  all: ["financial-periods"] as const,
  byType: (t: RecordType) => ["financial-periods", t] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useFinancialPeriods(recordType?: RecordType) {
  return useQuery<FinancialPeriodRecord[]>({
    queryKey: recordType ? keys.byType(recordType) : keys.all,
    queryFn: async () => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("financial_periods")
        .select("id, period_month, record_type, data, created_at, updated_at")
        .order("period_month", { ascending: true });
      if (recordType) q = q.eq("record_type", recordType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

export function useActualPeriods() {
  return useFinancialPeriods("actual");
}

export function useBudgetPeriods() {
  return useFinancialPeriods("budget");
}

export function useYtdActualPeriods() {
  return useFinancialPeriods("ytd_actual");
}

export function useUpsertFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      periodMonth,
      recordType = "actual",
      data,
    }: {
      periodMonth: string; // "YYYY-MM-DD"
      recordType?: RecordType;
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
          { org_id: orgId, period_month: periodMonth, record_type: recordType, data },
          { onConflict: "org_id,period_month,record_type" }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteFinancialPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("financial_periods")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
