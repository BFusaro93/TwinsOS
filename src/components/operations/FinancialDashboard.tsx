"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown, Minus,
  PlusCircle, Pencil, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  useFinancialPeriods,
  useUpsertFinancialPeriod,
  useDeleteFinancialPeriod,
  totalOpex,
  EMPTY_DATA,
  EMPTY_OPEX,
  type FinancialPeriodData,
  type FinancialPeriodRecord,
  type OperatingExpenses,
} from "@/lib/hooks/use-financial-periods";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const fmtK = (cents: number) => {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toFixed(0)}`;
};

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const monthLabel = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

const toMonthValue = (iso: string) => iso.slice(0, 7); // "YYYY-MM"

const fromMonthValue = (ym: string) => `${ym}-01`;

type Tab = "overview" | "pl" | "cashflow" | "entry";

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: number;
  prev?: number;
  icon: React.ReactNode;
  accent?: string;
}

function KpiCard({ label, value, prev, icon, accent = "text-brand-400" }: KpiCardProps) {
  const delta = prev !== undefined ? value - prev : null;
  const pct = prev && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${accent}`}>{fmt(value)}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          {icon}
        </div>
      </div>
      {delta !== null && pct !== null && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          {delta > 0 ? (
            <TrendingUp className="h-3 w-3 text-emerald-500" />
          ) : delta < 0 ? (
            <TrendingDown className="h-3 w-3 text-red-400" />
          ) : (
            <Minus className="h-3 w-3 text-slate-400" />
          )}
          <span
            className={
              delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-500" : "text-slate-400"
            }
          >
            {fmtPct(pct)} vs prior month
          </span>
        </div>
      )}
    </div>
  );
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────

function DollarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-md text-xs">
      <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium text-slate-800">{fmtK(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Number input (cents) ───────────────────────────────────────────────────────

interface CentsInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  negative?: boolean;
}

function CentsInput({ label, value, onChange, negative }: CentsInputProps) {
  const dollars = value / 100;
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
          $
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={dollars === 0 ? "" : Math.abs(dollars)}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onChange(Math.round((negative ? -v : v) * 100));
          }}
          placeholder="0"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

// ── Data Entry Form ───────────────────────────────────────────────────────────

interface EntryFormProps {
  initial?: { periodMonth: string; data: FinancialPeriodData };
  onCancel: () => void;
}

function EntryForm({ initial, onCancel }: EntryFormProps) {
  const upsert = useUpsertFinancialPeriod();

  const [month, setMonth] = useState<string>(
    initial ? toMonthValue(initial.periodMonth) : toMonthValue(new Date().toISOString().slice(0, 10))
  );

  const [d, setD] = useState<FinancialPeriodData>(
    initial?.data ?? { ...EMPTY_DATA, operating_expenses: { ...EMPTY_OPEX } }
  );

  const setField = <K extends keyof FinancialPeriodData>(k: K, v: FinancialPeriodData[K]) =>
    setD((prev) => {
      const next = { ...prev, [k]: v };
      next.gross_profit = next.revenue - next.cogs;
      next.ebitda = next.gross_profit - totalOpex(next.operating_expenses);
      next.net_income = next.ebitda - next.depreciation;
      return next;
    });

  const setOpex = (k: keyof OperatingExpenses, v: number) =>
    setD((prev) => {
      const opex = { ...prev.operating_expenses, [k]: v };
      const gross_profit = prev.revenue - prev.cogs;
      const ebitda = gross_profit - totalOpex(opex);
      const net_income = ebitda - prev.depreciation;
      return { ...prev, operating_expenses: opex, gross_profit, ebitda, net_income };
    });

  const [opexOpen, setOpexOpen] = useState(true);
  const [cfOpen, setCfOpen] = useState(true);

  async function handleSave() {
    await upsert.mutateAsync({ periodMonth: fromMonthValue(month), data: d });
    onCancel();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">
        {initial ? "Edit Period" : "Add Period"}
      </h2>

      {/* Month picker */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium text-slate-600">Period (Month)</label>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Income Statement */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Income Statement
      </p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CentsInput label="Revenue" value={d.revenue} onChange={(v) => setField("revenue", v)} />
        <CentsInput label="COGS" value={d.cogs} onChange={(v) => setField("cogs", v)} />
        <CentsInput label="Depreciation" value={d.depreciation} onChange={(v) => setField("depreciation", v)} />
      </div>

      {/* Computed summary */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-slate-500">Gross Profit</span>
          <p className={`font-bold ${d.gross_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {fmt(d.gross_profit)}
          </p>
        </div>
        <div>
          <span className="text-slate-500">EBITDA</span>
          <p className={`font-bold ${d.ebitda >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {fmt(d.ebitda)}
          </p>
        </div>
        <div>
          <span className="text-slate-500">Net Income</span>
          <p className={`font-bold ${d.net_income >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {fmt(d.net_income)}
          </p>
        </div>
      </div>

      {/* Operating Expenses */}
      <button
        type="button"
        onClick={() => setOpexOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600"
      >
        <span>Operating Expenses</span>
        {opexOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {opexOpen && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(EMPTY_OPEX) as (keyof OperatingExpenses)[]).map((k) => (
            <CentsInput
              key={k}
              label={k.charAt(0).toUpperCase() + k.slice(1)}
              value={d.operating_expenses[k]}
              onChange={(v) => setOpex(k, v)}
            />
          ))}
        </div>
      )}

      {/* Cash Flow */}
      <button
        type="button"
        onClick={() => setCfOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600"
      >
        <span>Cash Flow</span>
        {cfOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {cfOpen && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <CentsInput
            label="Operating CF"
            value={d.cash_operating}
            onChange={(v) => setField("cash_operating", v)}
          />
          <CentsInput
            label="Investing CF"
            value={d.cash_investing}
            onChange={(v) => setField("cash_investing", v)}
            negative
          />
          <CentsInput
            label="Financing CF"
            value={d.cash_financing}
            onChange={(v) => setField("cash_financing", v)}
          />
        </div>
      )}

      {/* Notes */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
        <textarea
          value={d.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={2}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          placeholder="Any context for this period…"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={upsert.isPending}
          className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {upsert.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ records }: { records: FinancialPeriodRecord[] }) {
  const latest = records[records.length - 1];
  const prev = records[records.length - 2];

  const chartData = records.map((r) => ({
    month: monthLabel(r.periodMonth),
    Revenue: r.data.revenue,
    "Gross Profit": r.data.gross_profit,
    "Net Income": r.data.net_income,
    COGS: r.data.cogs,
    OpEx: totalOpex(r.data.operating_expenses),
  }));

  const marginData = records.map((r) => ({
    month: monthLabel(r.periodMonth),
    "Gross Margin %": r.data.revenue > 0
      ? parseFloat(((r.data.gross_profit / r.data.revenue) * 100).toFixed(1))
      : 0,
    "Net Margin %": r.data.revenue > 0
      ? parseFloat(((r.data.net_income / r.data.revenue) * 100).toFixed(1))
      : 0,
  }));

  if (!latest) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <DollarSign className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No financial data yet</p>
        <p className="mt-1 text-xs">Add your first period using the Data Entry tab</p>
      </div>
    );
  }

  const grossMarginPct =
    latest.data.revenue > 0
      ? (latest.data.gross_profit / latest.data.revenue) * 100
      : 0;
  const netMarginPct =
    latest.data.revenue > 0
      ? (latest.data.net_income / latest.data.revenue) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Revenue"
          value={latest.data.revenue}
          prev={prev?.data.revenue}
          icon={<DollarSign className="h-5 w-5 text-brand-400" />}
          accent="text-brand-500"
        />
        <KpiCard
          label="Gross Profit"
          value={latest.data.gross_profit}
          prev={prev?.data.gross_profit}
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          accent={latest.data.gross_profit >= 0 ? "text-emerald-600" : "text-red-500"}
        />
        <KpiCard
          label="EBITDA"
          value={latest.data.ebitda}
          prev={prev?.data.ebitda}
          icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
          accent={latest.data.ebitda >= 0 ? "text-blue-600" : "text-red-500"}
        />
        <KpiCard
          label="Net Income"
          value={latest.data.net_income}
          prev={prev?.data.net_income}
          icon={<DollarSign className="h-5 w-5 text-slate-500" />}
          accent={latest.data.net_income >= 0 ? "text-emerald-600" : "text-red-500"}
        />
      </div>

      {/* Margin pills */}
      <div className="flex gap-3">
        <div className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600">
          Gross Margin:{" "}
          <span className={grossMarginPct >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
            {grossMarginPct.toFixed(1)}%
          </span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600">
          Net Margin:{" "}
          <span className={netMarginPct >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
            {netMarginPct.toFixed(1)}%
          </span>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600">
          Operating CF:{" "}
          <span className={latest.data.cash_operating >= 0 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>
            {fmt(latest.data.cash_operating)}
          </span>
        </div>
      </div>

      {/* Revenue vs Gross Profit vs Net Income */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Monthly Performance</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<DollarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gross Profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Net Income" fill="#a78bfa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Margin trend */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Margin Trends</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={marginData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
            <Line
              type="monotone"
              dataKey="Gross Margin %"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="Net Margin %"
              stroke="#a78bfa"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────

function PlTab({ records }: { records: FinancialPeriodRecord[] }) {
  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <p className="text-sm">No data yet</p>
      </div>
    );
  }

  const cols = records.slice(-12); // last 12 months

  const rows: { label: string; key: string; indent?: boolean; bold?: boolean; fg?: string }[] = [
    { label: "Revenue", key: "revenue", bold: true },
    { label: "COGS", key: "cogs", indent: true },
    { label: "Gross Profit", key: "gross_profit", bold: true, fg: "text-emerald-600" },
    { label: "Operating Expenses", key: "opex_total", indent: true },
    { label: "  — Payroll", key: "opex_payroll", indent: true },
    { label: "  — Equipment", key: "opex_equipment", indent: true },
    { label: "  — Fuel", key: "opex_fuel", indent: true },
    { label: "  — Insurance", key: "opex_insurance", indent: true },
    { label: "  — Marketing", key: "opex_marketing", indent: true },
    { label: "  — Rent", key: "opex_rent", indent: true },
    { label: "  — Utilities", key: "opex_utilities", indent: true },
    { label: "  — Other", key: "opex_other", indent: true },
    { label: "EBITDA", key: "ebitda", bold: true, fg: "text-blue-600" },
    { label: "Depreciation", key: "depreciation", indent: true },
    { label: "Net Income", key: "net_income", bold: true, fg: "text-emerald-600" },
  ];

  const getValue = (r: FinancialPeriodRecord, key: string): number => {
    switch (key) {
      case "revenue": return r.data.revenue;
      case "cogs": return r.data.cogs;
      case "gross_profit": return r.data.gross_profit;
      case "opex_total": return totalOpex(r.data.operating_expenses);
      case "opex_payroll": return r.data.operating_expenses.payroll;
      case "opex_equipment": return r.data.operating_expenses.equipment;
      case "opex_fuel": return r.data.operating_expenses.fuel;
      case "opex_insurance": return r.data.operating_expenses.insurance;
      case "opex_marketing": return r.data.operating_expenses.marketing;
      case "opex_rent": return r.data.operating_expenses.rent;
      case "opex_utilities": return r.data.operating_expenses.utilities;
      case "opex_other": return r.data.operating_expenses.other;
      case "ebitda": return r.data.ebitda;
      case "depreciation": return r.data.depreciation;
      case "net_income": return r.data.net_income;
      default: return 0;
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left font-semibold text-slate-600 min-w-[180px]">
              Category
            </th>
            {cols.map((r) => (
              <th key={r.id} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">
                {monthLabel(r.periodMonth)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={`border-b border-slate-50 last:border-0 ${row.bold ? "bg-slate-50" : "hover:bg-slate-50/50"}`}
            >
              <td
                className={`px-4 py-2.5 text-slate-700 ${row.bold ? "font-semibold" : ""} ${row.indent ? "pl-6" : ""}`}
              >
                {row.label}
              </td>
              {cols.map((r) => {
                const v = getValue(r, row.key);
                return (
                  <td
                    key={r.id}
                    className={`px-4 py-2.5 text-right tabular-nums ${
                      row.bold
                        ? (row.fg ?? (v >= 0 ? "text-slate-800 font-semibold" : "text-red-500 font-semibold"))
                        : "text-slate-600"
                    }`}
                  >
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cash Flow Tab ─────────────────────────────────────────────────────────────

function CashFlowTab({ records }: { records: FinancialPeriodRecord[] }) {
  if (!records.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <p className="text-sm">No data yet</p>
      </div>
    );
  }

  const chartData = records.map((r) => ({
    month: monthLabel(r.periodMonth),
    Operating: r.data.cash_operating,
    Investing: r.data.cash_investing,
    Financing: r.data.cash_financing,
    "Net Change": r.data.cash_operating + r.data.cash_investing + r.data.cash_financing,
  }));

  return (
    <div className="space-y-6">
      {/* Area chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Cash Flow by Activity</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<DollarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="Operating" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Investing" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Financing" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Net cash change line */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Net Cash Change</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={60} />
            <Tooltip content={<DollarTooltip />} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
            <Area
              type="monotone"
              dataKey="Net Change"
              stroke="#3b82f6"
              fill="#bfdbfe"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Period</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Operating</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Investing</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Financing</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Net Change</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => {
              const net = r.data.cash_operating + r.data.cash_investing + r.data.cash_financing;
              return (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{monthLabel(r.periodMonth)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.data.cash_operating >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {fmt(r.data.cash_operating)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.data.cash_investing >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {fmt(r.data.cash_investing)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.data.cash_financing >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {fmt(r.data.cash_financing)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {fmt(net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Data Entry Tab ────────────────────────────────────────────────────────────

function EntryTab({ records }: { records: FinancialPeriodRecord[] }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FinancialPeriodRecord | null>(null);
  const deletePeriod = useDeleteFinancialPeriod();

  if (editing) {
    return (
      <EntryForm
        initial={{ periodMonth: editing.periodMonth, data: editing.data }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (adding) {
    return <EntryForm onCancel={() => setAdding(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <PlusCircle className="h-4 w-4" />
          Add Period
        </button>
      </div>

      {records.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-400">
          <DollarSign className="mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm font-medium">No periods yet</p>
          <p className="mt-1 text-xs">Click &ldquo;Add Period&rdquo; to enter your first month of data</p>
        </div>
      )}

      {records.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Period</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Revenue</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Gross Profit</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Net Income</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Net Margin</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {[...records].reverse().map((r) => {
                const margin =
                  r.data.revenue > 0
                    ? ((r.data.net_income / r.data.revenue) * 100).toFixed(1)
                    : "—";
                return (
                  <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">
                      {monthLabel(r.periodMonth)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                      {fmt(r.data.revenue)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.data.gross_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmt(r.data.gross_profit)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.data.net_income >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmt(r.data.net_income)}
                    </td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${r.data.net_income >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {margin !== "—" ? `${margin}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(r)}
                          className="text-slate-400 hover:text-brand-500"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePeriod.mutate(r.id)}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FinancialDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const { data: records = [], isLoading } = useFinancialPeriods();

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "pl", label: "P&L" },
    { key: "cashflow", label: "Cash Flow" },
    { key: "entry", label: "Data Entry" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Financial Dashboard"
        description={
          records.length
            ? `${records.length} period${records.length !== 1 ? "s" : ""} on record`
            : "No financial data yet"
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
          Loading…
        </div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab records={records} />}
          {tab === "pl" && <PlTab records={records} />}
          {tab === "cashflow" && <CashFlowTab records={records} />}
          {tab === "entry" && <EntryTab records={records} />}
        </>
      )}
    </div>
  );
}
