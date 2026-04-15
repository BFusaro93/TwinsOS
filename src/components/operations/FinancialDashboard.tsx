"use client";

import { useState, useMemo, useRef, Fragment } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  DollarSign, TrendingUp, TrendingDown,
  PlusCircle, Pencil, Trash2, ChevronDown, ChevronUp,
  Upload, AlertCircle, CheckCircle2, Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrentUserStore } from "@/stores";
import {
  useActualPeriods,
  useBudgetPeriods,
  useUpsertFinancialPeriod,
  useDeleteFinancialPeriod,
  totalOpex,
  computeNOI,
  computeEbitda,
  recompute,
  EMPTY_DATA,
  EMPTY_OPEX,
  type FinancialPeriodData,
  type FinancialPeriodRecord,
  type OperatingExpenses,
  type RecordType,
} from "@/lib/hooks/use-financial-periods";
import { parseFinancialPdf } from "@/lib/utils/parse-financial-pdf";

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const fmtK = (cents: number) => {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (Math.abs(dollars) >= 1_000) return `$${(dollars / 1_000).toFixed(0)}K`;
  return `$${dollars.toFixed(0)}`;
};

const fmtPct = (n: number, includeSign = true) =>
  `${includeSign && n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const monthLabel = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};

const monthLabelLong = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const toMonthValue = (iso: string) => iso.slice(0, 7); // "YYYY-MM"
const fromMonthValue = (ym: string) => `${ym}-01`;
const yearOf = (iso: string) => parseInt(iso.slice(0, 4), 10);

// ── YTD aggregation ───────────────────────────────────────────────────────────

function sumData(records: FinancialPeriodRecord[]): FinancialPeriodData {
  if (!records.length) return { ...EMPTY_DATA, operating_expenses: { ...EMPTY_OPEX } };
  return records.reduce<FinancialPeriodData>(
    (acc, r) => ({
      revenue: acc.revenue + r.data.revenue,
      cogs: acc.cogs + r.data.cogs,
      gross_profit: acc.gross_profit + (r.data.gross_profit || r.data.revenue - r.data.cogs),
      operating_expenses: {
        payroll: acc.operating_expenses.payroll + (r.data.operating_expenses?.payroll ?? 0),
        equipment: acc.operating_expenses.equipment + (r.data.operating_expenses?.equipment ?? 0),
        fuel: acc.operating_expenses.fuel + (r.data.operating_expenses?.fuel ?? 0),
        insurance: acc.operating_expenses.insurance + (r.data.operating_expenses?.insurance ?? 0),
        marketing: acc.operating_expenses.marketing + (r.data.operating_expenses?.marketing ?? 0),
        rent: acc.operating_expenses.rent + (r.data.operating_expenses?.rent ?? 0),
        utilities: acc.operating_expenses.utilities + (r.data.operating_expenses?.utilities ?? 0),
        other: acc.operating_expenses.other + (r.data.operating_expenses?.other ?? 0),
      },
      net_operating_income: acc.net_operating_income + computeNOI(r.data),
      interest: acc.interest + (r.data.interest ?? 0),
      taxes: acc.taxes + (r.data.taxes ?? 0),
      guaranteed_payments: acc.guaranteed_payments + (r.data.guaranteed_payments ?? 0),
      depreciation: acc.depreciation + (r.data.depreciation ?? 0),
      ebitda: acc.ebitda + computeEbitda(r.data),
      net_income: acc.net_income + r.data.net_income,
      cash_operating: acc.cash_operating + r.data.cash_operating,
      cash_investing: acc.cash_investing + r.data.cash_investing,
      cash_financing: acc.cash_financing + r.data.cash_financing,
      notes: "",
    }),
    { ...EMPTY_DATA, operating_expenses: { ...EMPTY_OPEX } }
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type Tab = "overview" | "pl" | "ytd" | "cashflow" | "budget" | "entry";

// ── Variance badge ─────────────────────────────────────────────────────────────

function VarBadge({ actual, compare, label }: { actual: number; compare: number; label: string }) {
  if (!compare) return null;
  const delta = actual - compare;
  const pct = compare !== 0 ? (delta / Math.abs(compare)) * 100 : 0;
  const pos = delta >= 0;
  return (
    <div className="flex items-center gap-1 text-[10px] mt-0.5">
      {pos ? (
        <TrendingUp className="h-2.5 w-2.5 text-emerald-500" />
      ) : (
        <TrendingDown className="h-2.5 w-2.5 text-red-400" />
      )}
      <span className={pos ? "text-emerald-600" : "text-red-500"}>
        {fmtPct(pct)} {label}
      </span>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  sublabel?: string;
  value: number;
  prevMonth?: number;
  budget?: number;
  priorYear?: number;
  icon: React.ReactNode;
  accent?: string;
  positive?: boolean; // override color logic
}

function KpiCard({ label, sublabel, value, prevMonth, budget, priorYear, icon, accent = "text-brand-500", positive }: KpiCardProps) {
  const isPos = positive !== undefined ? positive : value >= 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          {sublabel && <p className="text-[10px] text-slate-400">{sublabel}</p>}
          <p className={`mt-1 text-2xl font-bold ${isPos ? accent : "text-red-500"}`}>
            {fmt(value)}
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
          {icon}
        </div>
      </div>
      <div className="mt-2 space-y-0.5">
        {prevMonth !== undefined && <VarBadge actual={value} compare={prevMonth} label="vs prior mo." />}
        {budget !== undefined && budget !== 0 && <VarBadge actual={value} compare={budget} label="vs budget" />}
        {priorYear !== undefined && priorYear !== 0 && <VarBadge actual={value} compare={priorYear} label="vs prior yr." />}
      </div>
    </div>
  );
}

// ── Dollar tooltip ─────────────────────────────────────────────────────────────

function DollarTooltip({ active, payload, label }: {
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

// ── Cents input ───────────────────────────────────────────────────────────────

interface CentsInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  negative?: boolean;
}

function CentsInput({ label, value, onChange, negative }: CentsInputProps) {
  const dollars = Math.abs(value) / 100;
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={dollars === 0 ? "" : dollars}
          onChange={(e) => {
            const v = parseFloat(e.target.value) || 0;
            onChange(Math.round((negative ? -v : v) * 100));
          }}
          placeholder="0.00"
          className="w-full rounded-md border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>
    </div>
  );
}

// ── PDF Import Widget ─────────────────────────────────────────────────────────

interface PdfImportProps {
  onImport: (data: Partial<FinancialPeriodData>, periodMonth?: string) => void;
}

function PdfImport({ onImport }: PdfImportProps) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file || file.type !== "application/pdf") {
      setErrorMsg("Please upload a PDF file.");
      setState("error");
      return;
    }
    setState("loading");
    setWarnings([]);
    setErrorMsg("");
    try {
      const result = await parseFinancialPdf(file);
      setWarnings(result.warnings);
      onImport(result.data, result.periodMonth);
      setState("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to parse PDF.");
      setState("error");
    }
  }

  return (
    <div className="mb-5 rounded-lg border border-dashed border-brand-300 bg-brand-50/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Upload className="h-4 w-4 text-brand-400" />
          <span className="font-medium">Import from PDF</span>
          <span className="text-slate-400">— QuickBooks P&L report</span>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={state === "loading"}
          className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {state === "loading" ? "Parsing…" : "Choose PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {state === "done" && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>PDF parsed — form pre-filled. Review and save.</span>
        </div>
      )}
      {state === "error" && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-red-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Data Entry Form ───────────────────────────────────────────────────────────

interface EntryFormProps {
  initial?: { periodMonth: string; recordType: RecordType; data: FinancialPeriodData };
  defaultRecordType?: RecordType;
  onCancel: () => void;
}

function EntryForm({ initial, defaultRecordType = "actual", onCancel }: EntryFormProps) {
  const upsert = useUpsertFinancialPeriod();

  const [month, setMonth] = useState<string>(
    initial ? toMonthValue(initial.periodMonth) : toMonthValue(new Date().toISOString().slice(0, 10))
  );
  const [recordType, setRecordType] = useState<RecordType>(initial?.recordType ?? defaultRecordType);
  const [d, setD] = useState<FinancialPeriodData>(
    initial?.data ?? { ...EMPTY_DATA, operating_expenses: { ...EMPTY_OPEX } }
  );
  const [opexOpen, setOpexOpen] = useState(true);
  const [belowOpen, setBelowOpen] = useState(true);
  const [cfOpen, setCfOpen] = useState(false);

  const setField = <K extends keyof FinancialPeriodData>(k: K, v: FinancialPeriodData[K]) =>
    setD((prev) => recompute({ ...prev, [k]: v }));

  const setOpex = (k: keyof OperatingExpenses, v: number) =>
    setD((prev) => recompute({ ...prev, operating_expenses: { ...prev.operating_expenses, [k]: v } }));

  function handleImport(partial: Partial<FinancialPeriodData>, periodMonthIso?: string) {
    if (periodMonthIso) setMonth(toMonthValue(periodMonthIso));
    setD((prev) => recompute({ ...prev, ...partial }));
  }

  async function handleSave() {
    await upsert.mutateAsync({ periodMonth: fromMonthValue(month), recordType, data: d });
    onCancel();
  }

  const noi = computeNOI(d);
  const ebitda = computeEbitda(d);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">
        {initial ? "Edit Period" : "Add Period"}
      </h2>

      {/* PDF Import (only show for new/actuals) */}
      {!initial && <PdfImport onImport={handleImport} />}

      {/* Month + type row */}
      <div className="mb-5 flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Period (Month)</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Record Type</label>
          <div className="flex gap-2">
            {(["actual", "budget"] as RecordType[]).map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() => setRecordType(rt)}
                className={`rounded-md px-3 py-2 text-sm font-medium capitalize transition-colors ${
                  recordType === rt
                    ? "bg-brand-500 text-white"
                    : "border border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {rt}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Income Statement */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Income Statement</p>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CentsInput label="Revenue" value={d.revenue} onChange={(v) => setField("revenue", v)} />
        <CentsInput label="COGS" value={d.cogs} onChange={(v) => setField("cogs", v)} />
      </div>

      {/* OpEx */}
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

      {/* Below-the-line */}
      <button
        type="button"
        onClick={() => setBelowOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600"
      >
        <span>Below-the-Line Adjustments</span>
        {belowOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {belowOpen && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <CentsInput label="Depreciation" value={d.depreciation} onChange={(v) => setField("depreciation", v)} />
          <CentsInput label="Interest" value={d.interest} onChange={(v) => setField("interest", v)} />
          <CentsInput label="Taxes" value={d.taxes} onChange={(v) => setField("taxes", v)} />
          <CentsInput label="Guaranteed Payments" value={d.guaranteed_payments} onChange={(v) => setField("guaranteed_payments", v)} />
        </div>
      )}

      {/* Computed summary */}
      <div className="mb-4 rounded-lg bg-slate-50 p-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
        {[
          { label: "Gross Profit", val: d.gross_profit },
          { label: "NOI", val: noi },
          { label: "Adj. EBITDA", val: ebitda },
          { label: "Net Income", val: d.net_income },
        ].map(({ label, val }) => (
          <div key={label}>
            <span className="text-slate-500">{label}</span>
            <p className={`font-bold ${val >= 0 ? "text-emerald-600" : "text-red-500"}`}>{fmt(val)}</p>
          </div>
        ))}
      </div>

      {/* Cash Flow */}
      <button
        type="button"
        onClick={() => setCfOpen((o) => !o)}
        className="mb-2 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600"
      >
        <span>Cash Flow (Optional)</span>
        {cfOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {cfOpen && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <CentsInput label="Operating CF" value={d.cash_operating} onChange={(v) => setField("cash_operating", v)} />
          <CentsInput label="Investing CF" value={d.cash_investing} onChange={(v) => setField("cash_investing", v)} negative />
          <CentsInput label="Financing CF" value={d.cash_financing} onChange={(v) => setField("cash_financing", v)} />
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
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
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

// ── Month Selector ─────────────────────────────────────────────────────────────

function MonthSelector({
  records,
  selected,
  onChange,
}: {
  records: FinancialPeriodRecord[];
  selected: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-slate-400" />
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        {[...records].reverse().map((r) => (
          <option key={r.id} value={r.periodMonth}>
            {monthLabelLong(r.periodMonth)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  actuals,
  budgets,
}: {
  actuals: FinancialPeriodRecord[];
  budgets: FinancialPeriodRecord[];
}) {
  const latestMonth = actuals[actuals.length - 1]?.periodMonth ?? "";
  const [selectedMonth, setSelectedMonth] = useState<string>(latestMonth);

  // keep selectedMonth in sync when records first load
  const selected = actuals.find((r) => r.periodMonth === selectedMonth) ?? actuals[actuals.length - 1];
  const prevRecord = selected
    ? actuals[actuals.findIndex((r) => r.periodMonth === selected.periodMonth) - 1]
    : undefined;
  const budgetRecord = budgets.find((b) => b.periodMonth === selected?.periodMonth);

  if (!actuals.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <DollarSign className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No financial data yet</p>
        <p className="mt-1 text-xs">Import a PDF or add your first period via Data Entry</p>
      </div>
    );
  }

  const d = selected!.data;
  const noi = computeNOI(d);
  const ebitda = computeEbitda(d);
  const grossMarginPct = d.revenue > 0 ? (d.gross_profit / d.revenue) * 100 : 0;
  const netMarginPct = d.revenue > 0 ? (d.net_income / d.revenue) * 100 : 0;
  const noiMarginPct = d.revenue > 0 ? (noi / d.revenue) * 100 : 0;

  const chartData = actuals.map((r) => ({
    month: monthLabel(r.periodMonth),
    Revenue: r.data.revenue,
    "Gross Profit": r.data.gross_profit,
    NOI: computeNOI(r.data),
    "Adj. EBITDA": computeEbitda(r.data),
    "Net Income": r.data.net_income,
  }));

  const marginData = actuals.map((r) => ({
    month: monthLabel(r.periodMonth),
    "Gross Margin %": r.data.revenue > 0 ? parseFloat(((r.data.gross_profit / r.data.revenue) * 100).toFixed(1)) : 0,
    "NOI Margin %": r.data.revenue > 0 ? parseFloat(((computeNOI(r.data) / r.data.revenue) * 100).toFixed(1)) : 0,
    "Net Margin %": r.data.revenue > 0 ? parseFloat(((r.data.net_income / r.data.revenue) * 100).toFixed(1)) : 0,
  }));

  return (
    <div className="space-y-6">
      {/* Period selector + margin pills */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthSelector records={actuals} selected={selected!.periodMonth} onChange={setSelectedMonth} />
        <div className="flex flex-wrap gap-2 ml-auto">
          {[
            { label: "Gross Margin", val: grossMarginPct },
            { label: "NOI Margin", val: noiMarginPct },
            { label: "Net Margin", val: netMarginPct },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              {label}:{" "}
              <span className={val >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-500"}>
                {val.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="Revenue"
          value={d.revenue}
          prevMonth={prevRecord?.data.revenue}
          budget={budgetRecord?.data.revenue}
          icon={<DollarSign className="h-5 w-5 text-brand-400" />}
          accent="text-brand-500"
          positive
        />
        <KpiCard
          label="Gross Profit"
          sublabel={`${grossMarginPct.toFixed(1)}% margin`}
          value={d.gross_profit}
          prevMonth={prevRecord?.data.gross_profit}
          budget={budgetRecord?.data.gross_profit}
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          accent="text-emerald-600"
        />
        <KpiCard
          label="Net Op. Income"
          sublabel={`${noiMarginPct.toFixed(1)}% margin`}
          value={noi}
          prevMonth={prevRecord ? computeNOI(prevRecord.data) : undefined}
          budget={budgetRecord ? computeNOI(budgetRecord.data) : undefined}
          icon={<TrendingUp className="h-5 w-5 text-blue-500" />}
          accent="text-blue-600"
        />
        <KpiCard
          label="Adj. EBITDA"
          sublabel="Net Inc + D&A + Int + Tax + GP"
          value={ebitda}
          prevMonth={prevRecord ? computeEbitda(prevRecord.data) : undefined}
          budget={budgetRecord ? computeEbitda(budgetRecord.data) : undefined}
          icon={<TrendingUp className="h-5 w-5 text-violet-500" />}
          accent="text-violet-600"
        />
        <KpiCard
          label="Net Income"
          sublabel={`${netMarginPct.toFixed(1)}% margin`}
          value={d.net_income}
          prevMonth={prevRecord?.data.net_income}
          budget={budgetRecord?.data.net_income}
          icon={<DollarSign className="h-5 w-5 text-slate-500" />}
          accent="text-emerald-600"
        />
      </div>

      {/* Monthly Performance chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Monthly Performance — All Periods</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
            <Tooltip content={<DollarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Gross Profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Adj. EBITDA" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Net Income" fill="#a78bfa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Margin trend */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Margin Trends</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={marginData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} width={50} />
            <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
            <Line type="monotone" dataKey="Gross Margin %" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="NOI Margin %" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Net Margin %" stroke="#a78bfa" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── P&L Tab ───────────────────────────────────────────────────────────────────

function PlTab({ records }: { records: FinancialPeriodRecord[] }) {
  if (!records.length) {
    return <div className="py-24 text-center text-sm text-slate-400">No data yet</div>;
  }

  const cols = records.slice(-12);

  const rows: { label: string; key: string; indent?: boolean; bold?: boolean; fg?: string; separator?: boolean }[] = [
    { label: "Revenue", key: "revenue", bold: true },
    { label: "Cost of Goods Sold", key: "cogs", indent: true },
    { label: "Gross Profit", key: "gross_profit", bold: true, fg: "emerald" },
    { label: "— Payroll", key: "opex_payroll", indent: true },
    { label: "— Equipment", key: "opex_equipment", indent: true },
    { label: "— Fuel", key: "opex_fuel", indent: true },
    { label: "— Insurance", key: "opex_insurance", indent: true },
    { label: "— Marketing", key: "opex_marketing", indent: true },
    { label: "— Rent", key: "opex_rent", indent: true },
    { label: "— Utilities", key: "opex_utilities", indent: true },
    { label: "— Other OpEx", key: "opex_other", indent: true },
    { label: "Total OpEx", key: "opex_total", indent: true, bold: true },
    { label: "Net Operating Income", key: "noi", bold: true, fg: "blue" },
    { label: "Depreciation & Amortization", key: "depreciation", indent: true },
    { label: "Interest Expense", key: "interest", indent: true },
    { label: "Taxes", key: "taxes", indent: true },
    { label: "Guaranteed Payments", key: "guaranteed_payments", indent: true },
    { label: "Net Income", key: "net_income", bold: true, fg: "emerald" },
    { label: "Adj. EBITDA", key: "ebitda", bold: true, fg: "violet" },
  ];

  const getValue = (r: FinancialPeriodRecord, key: string): number => {
    const d = r.data;
    switch (key) {
      case "revenue": return d.revenue;
      case "cogs": return d.cogs;
      case "gross_profit": return d.gross_profit;
      case "opex_payroll": return d.operating_expenses?.payroll ?? 0;
      case "opex_equipment": return d.operating_expenses?.equipment ?? 0;
      case "opex_fuel": return d.operating_expenses?.fuel ?? 0;
      case "opex_insurance": return d.operating_expenses?.insurance ?? 0;
      case "opex_marketing": return d.operating_expenses?.marketing ?? 0;
      case "opex_rent": return d.operating_expenses?.rent ?? 0;
      case "opex_utilities": return d.operating_expenses?.utilities ?? 0;
      case "opex_other": return d.operating_expenses?.other ?? 0;
      case "opex_total": return totalOpex(d.operating_expenses);
      case "noi": return computeNOI(d);
      case "depreciation": return d.depreciation ?? 0;
      case "interest": return d.interest ?? 0;
      case "taxes": return d.taxes ?? 0;
      case "guaranteed_payments": return d.guaranteed_payments ?? 0;
      case "net_income": return d.net_income;
      case "ebitda": return computeEbitda(d);
      default: return 0;
    }
  };

  const fgClass = (fg?: string, v?: number) => {
    if (!fg) return v !== undefined && v >= 0 ? "text-slate-800" : "text-red-500";
    if (fg === "emerald") return v !== undefined && v >= 0 ? "text-emerald-700" : "text-red-500";
    if (fg === "blue") return v !== undefined && v >= 0 ? "text-blue-700" : "text-red-500";
    if (fg === "violet") return v !== undefined && v >= 0 ? "text-violet-700" : "text-red-500";
    return "text-slate-800";
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="px-4 py-3 text-left font-semibold text-slate-600 min-w-[200px]">Category</th>
            {cols.map((r) => (
              <th key={r.id} className="px-4 py-3 text-right font-semibold text-slate-600 whitespace-nowrap">
                {monthLabel(r.periodMonth)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={`border-b border-slate-50 last:border-0 ${row.bold ? "bg-slate-50/70" : "hover:bg-slate-50/50"}`}>
              <td className={`px-4 py-2.5 text-slate-700 ${row.bold ? "font-semibold" : ""} ${row.indent ? "pl-8 text-slate-500" : ""}`}>
                {row.label}
              </td>
              {cols.map((r) => {
                const v = getValue(r, row.key);
                return (
                  <td
                    key={r.id}
                    className={`px-4 py-2.5 text-right tabular-nums ${row.bold ? `font-semibold ${fgClass(row.fg, v)}` : "text-slate-600"}`}
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

// ── YTD Tab ───────────────────────────────────────────────────────────────────

function YtdTab({ actuals, budgets }: { actuals: FinancialPeriodRecord[]; budgets: FinancialPeriodRecord[] }) {
  // Get available years
  const years = useMemo(() => {
    const ys = [...new Set(actuals.map((r) => yearOf(r.periodMonth)))].sort((a, b) => b - a);
    return ys;
  }, [actuals]);

  const [year, setYear] = useState<number>(years[0] ?? new Date().getFullYear());

  const ytdRecords = actuals.filter((r) => yearOf(r.periodMonth) === year);
  const budgetYtdRecords = budgets.filter((r) => yearOf(r.periodMonth) === year);
  const ytd = sumData(ytdRecords);
  const budgetYtd = sumData(budgetYtdRecords);
  const hasBudget = budgetYtdRecords.length > 0;

  const ytdNoi = computeNOI(ytd);
  const ytdEbitda = computeEbitda(ytd);
  const budgetNoi = computeNOI(budgetYtd);
  const budgetEbitda = computeEbitda(budgetYtd);

  // Monthly progression chart
  const monthlyChart = ytdRecords.map((r) => ({
    month: monthLabel(r.periodMonth),
    Revenue: r.data.revenue,
    NOI: computeNOI(r.data),
    "Net Income": r.data.net_income,
    ...(budgets.find((b) => b.periodMonth === r.periodMonth)
      ? { "Budget Revenue": budgets.find((b) => b.periodMonth === r.periodMonth)!.data.revenue }
      : {}),
  }));

  if (!actuals.length) {
    return <div className="py-24 text-center text-sm text-slate-400">No data yet</div>;
  }

  return (
    <div className="space-y-6">
      {/* Year selector */}
      <div className="flex items-center gap-3">
        <Calendar className="h-4 w-4 text-slate-400" />
        <select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          {years.map((y) => <option key={y} value={y}>{y} YTD</option>)}
        </select>
        <span className="text-xs text-slate-400">{ytdRecords.length} month{ytdRecords.length !== 1 ? "s" : ""} on record</span>
      </div>

      {/* YTD KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "Revenue YTD", val: ytd.revenue, bud: budgetYtd.revenue },
          { label: "Gross Profit YTD", val: ytd.gross_profit, bud: budgetYtd.gross_profit },
          { label: "NOI YTD", val: ytdNoi, bud: budgetNoi },
          { label: "Adj. EBITDA YTD", val: ytdEbitda, bud: budgetEbitda },
          { label: "Net Income YTD", val: ytd.net_income, bud: budgetYtd.net_income },
        ].map(({ label, val, bud }) => (
          <KpiCard
            key={label}
            label={label}
            value={val}
            budget={hasBudget ? bud : undefined}
            icon={<DollarSign className="h-5 w-5 text-slate-400" />}
            accent="text-brand-600"
          />
        ))}
      </div>

      {/* Monthly progression */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">{year} Monthly Progression</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
            <Tooltip content={<DollarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="NOI" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Net Income" fill="#a78bfa" radius={[4, 4, 0, 0]} />
            {hasBudget && <Bar dataKey="Budget Revenue" fill="#bfdbfe" radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cumulative running total */}
      {ytdRecords.length > 1 && (() => {
        let cumRevenue = 0;
        let cumNI = 0;
        const cumData = ytdRecords.map((r) => {
          cumRevenue += r.data.revenue;
          cumNI += r.data.net_income;
          return { month: monthLabel(r.periodMonth), "Cumulative Revenue": cumRevenue, "Cumulative Net Income": cumNI };
        });
        return (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">Cumulative YTD</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={cumData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
                <Tooltip content={<DollarTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Cumulative Revenue" stroke="#3b82f6" fill="#bfdbfe" strokeWidth={2} />
                <Area type="monotone" dataKey="Cumulative Net Income" stroke="#22c55e" fill="#bbf7d0" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );
      })()}

      {/* YTD summary table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Metric</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">YTD Actual</th>
              {hasBudget && <th className="px-4 py-3 text-right font-semibold text-slate-600">YTD Budget</th>}
              {hasBudget && <th className="px-4 py-3 text-right font-semibold text-slate-600">Variance $</th>}
              {hasBudget && <th className="px-4 py-3 text-right font-semibold text-slate-600">Variance %</th>}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Revenue", a: ytd.revenue, b: budgetYtd.revenue },
              { label: "Gross Profit", a: ytd.gross_profit, b: budgetYtd.gross_profit },
              { label: "Net Operating Income", a: ytdNoi, b: budgetNoi },
              { label: "Adj. EBITDA", a: ytdEbitda, b: budgetEbitda },
              { label: "Net Income", a: ytd.net_income, b: budgetYtd.net_income },
            ].map(({ label, a, b }) => {
              const var$ = a - b;
              const varPct = b !== 0 ? (var$ / Math.abs(b)) * 100 : 0;
              return (
                <tr key={label} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{label}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-800 font-semibold">{fmt(a)}</td>
                  {hasBudget && <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{fmt(b)}</td>}
                  {hasBudget && (
                    <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${var$ >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {var$ >= 0 ? "+" : ""}{fmt(var$)}
                    </td>
                  )}
                  {hasBudget && (
                    <td className={`px-4 py-2.5 text-right tabular-nums ${varPct >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmtPct(varPct)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Cash Flow Tab ─────────────────────────────────────────────────────────────

function CashFlowTab({ records }: { records: FinancialPeriodRecord[] }) {
  if (!records.length) return <div className="py-24 text-center text-sm text-slate-400">No data yet</div>;

  const chartData = records.map((r) => ({
    month: monthLabel(r.periodMonth),
    Operating: r.data.cash_operating,
    Investing: r.data.cash_investing,
    Financing: r.data.cash_financing,
    "Net Change": r.data.cash_operating + r.data.cash_investing + r.data.cash_financing,
  }));

  const allZero = records.every(
    (r) => r.data.cash_operating === 0 && r.data.cash_investing === 0 && r.data.cash_financing === 0
  );

  if (allZero) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <DollarSign className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No cash flow data entered yet</p>
        <p className="mt-1 text-xs">Add operating, investing, and financing figures in the Data Entry tab</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Cash Flow by Activity</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
            <Tooltip content={<DollarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="Operating" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Investing" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Financing" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Net Cash Change</h3>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
            <Tooltip content={<DollarTooltip />} />
            <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
            <Area type="monotone" dataKey="Net Change" stroke="#3b82f6" fill="#bfdbfe" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

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
                  <td className="px-4 py-2.5 font-medium text-slate-700">{monthLabel(r.periodMonth)}</td>
                  {[r.data.cash_operating, r.data.cash_investing, r.data.cash_financing, net].map((v, i) => (
                    <td key={i} className={`px-4 py-2.5 text-right tabular-nums ${i === 3 ? "font-semibold " : ""}${v >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Budget Tab ────────────────────────────────────────────────────────────────

function BudgetTab({ actuals, budgets }: { actuals: FinancialPeriodRecord[]; budgets: FinancialPeriodRecord[] }) {
  // ── All hooks must come before any early returns (Rules of Hooks) ──────────
  const [selectedMetric, setSelectedMetric] = useState("revenue");

  if (!budgets.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
        <DollarSign className="mb-3 h-10 w-10 opacity-30" />
        <p className="text-sm font-medium">No budget data yet</p>
        <p className="mt-1 text-xs">Add budget entries via the Data Entry tab — select &ldquo;Budget&rdquo; as the record type</p>
      </div>
    );
  }

  // Build comparison by month
  const months = [...new Set([
    ...actuals.map((r) => r.periodMonth),
    ...budgets.map((r) => r.periodMonth),
  ])].sort();

  const metrics: { key: string; label: string; color: string; budgetColor: string }[] = [
    { key: "revenue", label: "Revenue", color: "#3b82f6", budgetColor: "#bfdbfe" },
    { key: "gross_profit", label: "Gross Profit", color: "#22c55e", budgetColor: "#bbf7d0" },
    { key: "noi", label: "NOI", color: "#0ea5e9", budgetColor: "#bae6fd" },
    { key: "ebitda", label: "Adj. EBITDA", color: "#8b5cf6", budgetColor: "#ddd6fe" },
    { key: "net_income", label: "Net Income", color: "#a78bfa", budgetColor: "#ede9fe" },
  ];

  const getVal = (r: FinancialPeriodRecord | undefined, key: string): number => {
    if (!r) return 0;
    switch (key) {
      case "revenue": return r.data.revenue;
      case "gross_profit": return r.data.gross_profit;
      case "noi": return computeNOI(r.data);
      case "ebitda": return computeEbitda(r.data);
      case "net_income": return r.data.net_income;
      default: return 0;
    }
  };

  const chartData = months.map((m) => {
    const a = actuals.find((r) => r.periodMonth === m);
    const b = budgets.find((r) => r.periodMonth === m);
    return {
      month: monthLabel(m),
      Actual: getVal(a, selectedMetric),
      Budget: getVal(b, selectedMetric),
    };
  });

  const metric = metrics.find((m) => m.key === selectedMetric)!;

  return (
    <div className="space-y-6">
      {/* Metric selector */}
      <div className="flex flex-wrap gap-2">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setSelectedMetric(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedMetric === m.key ? "bg-brand-500 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Actual vs Budget chart */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Actual vs Budget — {metric.label}</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
            <Tooltip content={<DollarTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Actual" fill={metric.color} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Budget" fill={metric.budgetColor} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Variance waterfall */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold text-slate-700">Variance — {metric.label}</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={chartData.map((d) => ({ ...d, Variance: d.Actual - d.Budget }))}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} />
            <Tooltip content={<DollarTooltip />} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Bar dataKey="Variance" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={(d.Actual - d.Budget) >= 0 ? "#22c55e" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detail table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Period</th>
              {metrics.map((m) => (
                <th key={m.key} colSpan={3} className="px-4 py-3 text-center font-semibold text-slate-600 border-l border-slate-100">
                  {m.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="px-4 py-2 text-left text-slate-500" />
              {metrics.map((m) => (
                <Fragment key={m.key}>
                  <th className="px-3 py-2 text-right text-slate-500 border-l border-slate-100">Actual</th>
                  <th className="px-3 py-2 text-right text-slate-500">Budget</th>
                  <th className="px-3 py-2 text-right text-slate-500">Var %</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const a = actuals.find((r) => r.periodMonth === m);
              const b = budgets.find((r) => r.periodMonth === m);
              return (
                <tr key={m} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{monthLabel(m)}</td>
                  {metrics.map((met) => {
                    const av = getVal(a, met.key);
                    const bv = getVal(b, met.key);
                    const vp = bv !== 0 ? ((av - bv) / Math.abs(bv)) * 100 : 0;
                    return (
                      <Fragment key={met.key}>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 font-medium border-l border-slate-50">
                          {a ? fmt(av) : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                          {b ? fmt(bv) : "—"}
                        </td>
                        <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${a && b ? (vp >= 0 ? "text-emerald-600" : "text-red-500") : "text-slate-300"}`}>
                          {a && b ? fmtPct(vp) : "—"}
                        </td>
                      </Fragment>
                    );
                  })}
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

function EntryTab({ actuals, budgets }: { actuals: FinancialPeriodRecord[]; budgets: FinancialPeriodRecord[] }) {
  const [adding, setAdding] = useState(false);
  const [addingType, setAddingType] = useState<RecordType>("actual");
  const [editing, setEditing] = useState<FinancialPeriodRecord | null>(null);
  const deletePeriod = useDeleteFinancialPeriod();

  const all = useMemo(
    () => [...actuals, ...budgets].sort((a, b) => b.periodMonth.localeCompare(a.periodMonth)),
    [actuals, budgets]
  );

  if (editing) {
    return (
      <EntryForm
        initial={{ periodMonth: editing.periodMonth, recordType: editing.recordType, data: editing.data }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  if (adding) {
    return <EntryForm defaultRecordType={addingType} onCancel={() => setAdding(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setAddingType("budget"); setAdding(true); }}
          className="flex items-center gap-2 rounded-md border border-brand-400 px-4 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
        >
          <PlusCircle className="h-4 w-4" />
          Add Budget
        </button>
        <button
          type="button"
          onClick={() => { setAddingType("actual"); setAdding(true); }}
          className="flex items-center gap-2 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
        >
          <PlusCircle className="h-4 w-4" />
          Add Actuals
        </button>
      </div>

      {all.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center text-slate-400">
          <DollarSign className="mb-3 h-8 w-8 opacity-30" />
          <p className="text-sm font-medium">No periods yet</p>
          <p className="mt-1 text-xs">Click &ldquo;Add Actuals&rdquo; to import from PDF or enter manually</p>
        </div>
      )}

      {all.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Period</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Type</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Revenue</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Gross Profit</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">NOI</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Adj. EBITDA</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Net Income</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{monthLabel(r.periodMonth)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      r.recordType === "actual"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-blue-50 text-blue-700"
                    }`}>
                      {r.recordType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmt(r.data.revenue)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${r.data.gross_profit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {fmt(r.data.gross_profit)}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${computeNOI(r.data) >= 0 ? "text-blue-600" : "text-red-500"}`}>
                    {fmt(computeNOI(r.data))}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${computeEbitda(r.data) >= 0 ? "text-violet-600" : "text-red-500"}`}>
                    {fmt(computeEbitda(r.data))}
                  </td>
                  <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${r.data.net_income >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {fmt(r.data.net_income)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button type="button" onClick={() => setEditing(r)} className="text-slate-400 hover:text-brand-500">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete ${monthLabel(r.periodMonth)} ${r.recordType}?`)) {
                            deletePeriod.mutate(r.id);
                          }
                        }}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function FinancialDashboard() {
  const { currentUser } = useCurrentUserStore();
  const [tab, setTab] = useState<Tab>("overview");
  // Hooks must be called unconditionally (Rules of Hooks) — fetch happens for
  // all renders; non-admins see the access-restricted screen before any data is used.
  const { data: actuals = [], isLoading: loadingActuals } = useActualPeriods();
  const { data: budgets = [], isLoading: loadingBudgets } = useBudgetPeriods();

  if (currentUser.role !== "admin") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
        <DollarSign className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium">Access restricted</p>
        <p className="text-xs text-slate-400">The Financial dashboard is only available to administrators.</p>
      </div>
    );
  }

  const isLoading = loadingActuals || loadingBudgets;

  const latestMonth = actuals[actuals.length - 1];
  const latestLabel = latestMonth ? monthLabelLong(latestMonth.periodMonth) : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "pl", label: "P&L" },
    { key: "ytd", label: "YTD" },
    { key: "cashflow", label: "Cash Flow" },
    { key: "budget", label: "Budget" },
    { key: "entry", label: "Data Entry" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Financial Dashboard"
        description={latestLabel ? `Latest: ${latestLabel}` : "No financial data yet — import a PDF to get started"}
      />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading…</div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab actuals={actuals} budgets={budgets} />}
          {tab === "pl" && <PlTab records={actuals} />}
          {tab === "ytd" && <YtdTab actuals={actuals} budgets={budgets} />}
          {tab === "cashflow" && <CashFlowTab records={actuals} />}
          {tab === "budget" && <BudgetTab actuals={actuals} budgets={budgets} />}
          {tab === "entry" && <EntryTab actuals={actuals} budgets={budgets} />}
        </>
      )}
    </div>
  );
}
