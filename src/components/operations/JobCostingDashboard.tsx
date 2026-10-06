"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings-store";
import { useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import {
  useJobCostingScenarios,
  useCreateJobCostingScenario,
  useUpdateJobCostingScenario,
  useDeleteJobCostingScenario,
  useSetDefaultJobCostingScenario,
  type JobCostingScenario,
} from "@/lib/hooks/use-job-costing-scenarios";
import { compute, BLANK_INPUTS, inputsEqual, type Inputs } from "@/lib/job-costing-calc";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  DollarSign, Users, Clock, TrendingUp,
  Plus, Trash2, Copy, ChevronDown, ChevronUp, Info, Pencil, X, Check, Star,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { ApplyRatesToProjectsDialog } from "@/components/shared/ApplyRatesToProjectsDialog";

// The rate math lives in @/lib/job-costing-calc. Inputs and scenarios are
// per-org data (job_costing_scenarios); a new org starts with none and a blank
// form, and marks one scenario as the default that this screen loads.

type Tab = "calculator" | "scenarios";

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtDollar = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const fmtDollarWhole = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

// ── Shared input components ───────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
      {children}
    </p>
  );
}

interface NumInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
  compact?: boolean;
}

function NumInput({ label, value, onChange, prefix, suffix, step = 1, min = 0, max, hint, compact }: NumInputProps) {
  return (
    <div>
      <label className={`mb-1 flex items-center gap-1 font-medium text-slate-600 dark:text-neutral-400 ${compact ? "text-[11px]" : "text-xs"}`}>
        {label}
        {hint && (
          // Focusable so a tap reveals the hint on touch (hover never fires there).
          // On a phone the bubble is pinned to the screen edges instead of
          // hanging off the icon, where it ran past the right edge.
          <span className="group relative cursor-help" tabIndex={0}>
            <Info className="h-3 w-3 text-slate-400 dark:text-neutral-500" />
            <span className="pointer-events-none invisible absolute left-4 top-0 z-10 w-44 rounded-md border border-border bg-card p-2 text-[10px] text-slate-600 dark:text-neutral-400 opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 max-sm:fixed max-sm:inset-x-4 max-sm:left-4 max-sm:top-auto max-sm:w-auto">
              {hint}
            </span>
          </span>
        )}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-2.5 text-sm text-slate-400 dark:text-neutral-500">{prefix}</span>
        )}
        <input
          type="number"
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) onChange(v);
          }}
          className={`w-full rounded-md border border-slate-300 dark:border-neutral-700 bg-card text-slate-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-brand-400
            ${compact ? "py-1.5 text-xs" : "py-2 text-sm"}
            ${prefix ? "pl-6 pr-2" : suffix ? "pl-2.5 pr-7" : "px-2.5"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 text-sm text-slate-400 dark:text-neutral-500">{suffix}</span>
        )}
      </div>
    </div>
  );
}

interface ResultRowProps {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  highlight?: boolean;
}

function ResultRow({ label, value, muted, bold, highlight }: ResultRowProps) {
  return (
    <div className={`flex items-center justify-between rounded-md px-3 py-2 ${highlight ? "bg-brand-500" : muted ? "" : "bg-slate-50 dark:bg-muted/40"}`}>
      <span className={`text-sm ${bold || highlight ? "font-semibold" : "font-medium"} ${highlight ? "text-white" : muted ? "text-muted-foreground" : "text-slate-700 dark:text-neutral-300"}`}>
        {label}
      </span>
      <span className={`text-sm ${bold || highlight ? "font-bold" : ""} ${highlight ? "text-white" : muted ? "text-muted-foreground" : "text-slate-800 dark:text-neutral-100"}`}>
        {value}
      </span>
    </div>
  );
}

function RateTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-md text-xs">
      <p className="mb-1.5 font-semibold text-slate-700 dark:text-neutral-300">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium text-slate-800 dark:text-neutral-100">{fmtDollar(p.value)}/hr</span>
        </div>
      ))}
    </div>
  );
}

// ── Inputs form (reused in both calculator and scenario editor) ───────────────

interface InputsFormProps {
  inputs: Inputs;
  setInputs: (i: Inputs) => void;
  compact?: boolean;
}

function InputsForm({ inputs, setInputs, compact }: InputsFormProps) {
  const set = <K extends keyof Inputs>(k: K) => (v: number) =>
    setInputs({ ...inputs, [k]: v });
  const [showBurden, setShowBurden] = useState(true);
  const burden = compute(inputs);
  const burdenTotal = burden.burdenPct;

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Field Labor</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <NumInput compact={compact} label="Wage ($/hr)" value={inputs.fieldEmpWage} onChange={set("fieldEmpWage")} prefix="$" step={0.01} />
          <NumInput compact={compact} label="# Field Employees" value={inputs.numFieldEmp} onChange={set("numFieldEmp")} step={1} min={1} />
          <NumInput compact={compact} label="Regular Hours / Employee" value={inputs.fieldHrsReg} onChange={set("fieldHrsReg")} step={40} hint="Total regular hours per employee for the period (e.g. 32 weeks × 40 hrs = 1,280)" />
          <NumInput compact={compact} label="OT Hours / Employee" value={inputs.fieldHrsOT} onChange={set("fieldHrsOT")} step={8} hint="Total overtime hours per employee. Counted at base wage for blended rate — OT cost tracked separately." />
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowBurden(!showBurden)}
          className="mb-2 flex w-full items-center justify-between"
        >
          <SectionLabel>Payroll Burden — {fmtPct(burdenTotal)} total</SectionLabel>
          {showBurden ? <ChevronUp className="h-4 w-4 text-slate-400 dark:text-neutral-500" /> : <ChevronDown className="h-4 w-4 text-slate-400 dark:text-neutral-500" />}
        </button>
        {showBurden && (
          <div className="grid grid-cols-2 gap-3">
            <NumInput compact={compact} label="FICA %" value={inputs.ficaPct} onChange={set("ficaPct")} suffix="%" step={0.01} hint="Social Security (6.2%) + Medicare (1.45%) = 7.65%" />
            <NumInput compact={compact} label="Work Comp %" value={inputs.workCompPct} onChange={set("workCompPct")} suffix="%" step={0.01} />
            <NumInput compact={compact} label="SUI %" value={inputs.suiPct} onChange={set("suiPct")} suffix="%" step={0.01} hint="State Unemployment Insurance rate. It only applies up to the wage base below." />
            <NumInput compact={compact} label="FUI %" value={inputs.fuiPct} onChange={set("fuiPct")} suffix="%" step={0.01} hint="Federal Unemployment Insurance rate. It only applies up to the wage base below." />
            <NumInput compact={compact} label="SUI wage base ($/employee)" value={inputs.suiWageBase} onChange={set("suiWageBase")} prefix="$" step={500} hint="Taxable wages per employee in this period (MA: first $15,000 per year). 0 = no cap, SUI % applies to all wages." />
            <NumInput compact={compact} label="FUI wage base ($/employee)" value={inputs.fuiWageBase} onChange={set("fuiWageBase")} prefix="$" step={500} hint="Federal: first $7,000 per employee per year. 0 = no cap." />
            <NumInput compact={compact} label="PFML %" value={inputs.pfmlPct} onChange={set("pfmlPct")} suffix="%" step={0.01} hint="Paid Family & Medical Leave — employer portion" />
            {(inputs.suiWageBase > 0 || inputs.fuiWageBase > 0) && (
              <p className="col-span-2 text-[11px] text-muted-foreground">
                After wage-base caps: SUI {fmtPct(burden.suiEffectivePct)} and FUI {fmtPct(burden.fuiEffectivePct)} of total wages.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Overhead</SectionLabel>
        <div className="grid grid-cols-1 gap-3">
          <NumInput compact={compact} label="OH Payroll (admin/management)" value={inputs.ohPayroll} onChange={set("ohPayroll")} prefix="$" hint="Total payroll for non-field staff (office, management)" />
          <NumInput compact={compact} label="Other Overhead" value={inputs.otherOH} onChange={set("otherOH")} prefix="$" hint="Equipment, vehicles, insurance, rent, utilities, etc." />
          <NumInput compact={compact} label="Total Liabilities" value={inputs.liabilities} onChange={set("liabilities")} prefix="$" hint="Loan payments, notes payable, etc." />
        </div>
      </div>

      <div>
        <SectionLabel>Rate Parameters</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <NumInput compact={compact} label="Non-Billable %" value={inputs.nonBillablePct} onChange={set("nonBillablePct")} suffix="%" step={1} max={99} hint="Travel time, setup, breaks — hours worked but not billed" />
          <NumInput compact={compact} label="Target Profit %" value={inputs.profitPct} onChange={set("profitPct")} suffix="%" step={1} max={99} hint="Profit as % of revenue (bid rate)" />
        </div>
      </div>
    </div>
  );
}

// ── Calculator Tab ─────────────────────────────────────────────────────────────

interface CalculatorTabProps {
  inputs: Inputs;
  setInputs: (i: Inputs) => void;
  /** Name of the scenario the form was loaded from, if any. */
  scenarioName: string | null;
  /** The org has no scenarios saved yet — the form starts blank. */
  noScenarios: boolean;
  /** The form differs from the loaded scenario. */
  dirty: boolean;
  onUpdateScenario: () => void;
  updatingScenario: boolean;
}

function CalculatorTab({
  inputs, setInputs, scenarioName, noScenarios, dirty, onUpdateScenario, updatingScenario,
}: CalculatorTabProps) {
  const c = useMemo(() => compute(inputs), [inputs]);
  const {
    breakevenLaborRateCents, setBreakevenLaborRateCents,
    burdenedLaborRateCents, setBurdenedLaborRateCents,
  } = useSettingsStore();
  const { mutate: updateOrgSettings } = useUpdateOrgSettings();
  const [savedRates, setSavedRates] = useState(false);
  // After the rates are saved: offer to also update open projects.
  const [ratesPrompt, setRatesPrompt] = useState<{ full: number; burdened: number } | null>(null);

  const breakEvenCents = Math.round(c.breakEven * 100);
  const llrCents = Math.round(c.loadedLaborRate * 100);
  const alreadyUsing = breakEvenCents === breakevenLaborRateCents && llrCents === burdenedLaborRateCents;
  const hasRates = breakEvenCents > 0;

  // Saves BOTH org rates from this calculation: Break-Even (labor + overhead,
  // grossed up for non-billable time) and LLR (burdened labor grossed up for
  // non-billable time, no overhead). New projects snapshot these; existing
  // projects only change if the user opts in via the dialog.
  const handleSaveRates = useCallback(() => {
    setBreakevenLaborRateCents(breakEvenCents);
    setBurdenedLaborRateCents(llrCents);
    updateOrgSettings(
      { customizations: { breakevenLaborRateCents: breakEvenCents, burdenedLaborRateCents: llrCents } },
      {
        onSuccess: () => {
          setSavedRates(true);
          setTimeout(() => setSavedRates(false), 2000);
          setRatesPrompt({ full: breakEvenCents, burdened: llrCents });
        },
      },
    );
  }, [breakEvenCents, llrCents, setBreakevenLaborRateCents, setBurdenedLaborRateCents, updateOrgSettings]);

  // Per billable hour; guarded so the blank form doesn't produce NaN.
  const perBillable = (n: number) => (c.billableHours > 0 ? parseFloat((n / c.billableHours).toFixed(2)) : 0);

  const breakdownData = [
    {
      name: "Bid Rate",
      "Direct Labor": perBillable(c.totalDirectLabor),
      "Payroll Burden": perBillable(c.burdenAmount),
      "OH Payroll": parseFloat(c.ohPayrollPerHour.toFixed(2)),
      "Other OH": parseFloat(c.otherOHPerHour.toFixed(2)),
      "Liabilities": parseFloat(c.liabilitiesPerHour.toFixed(2)),
      "Profit": parseFloat(c.profitPerHour.toFixed(2)),
    },
  ];

  const pieData = [
    { name: "Direct Labor", value: perBillable(c.totalDirectLabor), color: "#60ab45" },
    { name: "Payroll Burden", value: perBillable(c.burdenAmount), color: "#86efac" },
    { name: "OH Payroll", value: c.ohPayrollPerHour, color: "#93c5fd" },
    { name: "Other OH", value: c.otherOHPerHour, color: "#818cf8" },
    { name: "Liabilities", value: c.liabilitiesPerHour, color: "#a78bfa" },
    { name: "Profit", value: c.profitPerHour, color: "#fbbf24" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {noScenarios ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-neutral-700 bg-slate-50 dark:bg-muted/40 px-5 py-4 text-sm text-slate-600 dark:text-neutral-400">
          <p className="font-medium text-slate-800 dark:text-neutral-100">No scenarios yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Enter your numbers below and click <strong>Save as Scenario</strong>. Then open the Scenarios tab and set one as
            the default — it will load here every time.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">
            {scenarioName ? <>Scenario: <strong className="text-slate-800 dark:text-neutral-100">{scenarioName}</strong></> : "No default scenario selected — set one on the Scenarios tab"}
          </span>
          {scenarioName && dirty && (
            <>
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Unsaved changes</span>
              <button
                type="button"
                onClick={onUpdateScenario}
                disabled={updatingScenario}
                className="rounded-md border border-slate-300 dark:border-neutral-700 bg-card px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-muted/40 disabled:opacity-50"
              >
                {updatingScenario ? "Saving…" : `Update “${scenarioName}”`}
              </button>
            </>
          )}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Bid Rate</p>
              <p className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">{fmtDollar(c.bidRate)}<span className="text-sm font-normal text-slate-400 dark:text-neutral-500">/hr</span></p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/30">
              <DollarSign className="h-5 w-5 text-brand-500 dark:text-brand-400" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Break-even + {fmtPct(inputs.profitPct)} margin</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Break-Even</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-neutral-100">{fmtDollar(c.breakEven)}<span className="text-sm font-normal text-slate-400 dark:text-neutral-500">/hr</span></p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Labor {fmtDollar(c.laborPerHour)} + OH {fmtDollar(c.ohPerHour)}</p>
          <p className="mt-1 text-xs text-muted-foreground">LLR {fmtDollar(c.loadedLaborRate)} (labor only, no overhead)</p>
          <button
            type="button"
            onClick={handleSaveRates}
            disabled={!hasRates}
            className="mt-2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-400 disabled:cursor-not-allowed disabled:text-slate-300 dark:disabled:text-neutral-500"
          >
            {savedRates ? "✓ Saved as project rates" : alreadyUsing ? "Using these rates" : "Set as project rates"}
          </button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Billable Hours</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-neutral-100">{fmtNum(c.billableHours)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{fmtPct(inputs.nonBillablePct)} non-billable of {fmtNum(c.totalHours)} total</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Season Revenue</p>
              <p className="mt-1 text-2xl font-bold text-slate-800 dark:text-neutral-100">{fmtDollarWhole(c.bidRate * c.billableHours)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">At full utilization — {inputs.numFieldEmp} employees</p>
        </div>
      </div>

      {/* Two-column: inputs + results */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-5 text-sm font-semibold text-slate-800 dark:text-neutral-100">Inputs</h3>
          <InputsForm inputs={inputs} setInputs={setInputs} />
        </div>

        <div className="flex flex-col gap-4">
          {/* Rate breakdown card */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-neutral-100">Rate Calculation</h3>
            <div className="space-y-1.5">
              <ResultRow label="Direct Labor/hr" value={fmtDollar(c.totalHours > 0 ? c.totalDirectLabor / c.totalHours : 0)} muted />
              <ResultRow label={`Payroll Burden/hr (${fmtPct(c.burdenPct)})`} value={fmtDollar(c.totalHours > 0 ? c.burdenAmount / c.totalHours : 0)} muted />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="Burdened Labor/hr" value={fmtDollar(c.laborPerHour)} bold />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="OH Payroll/hr" value={fmtDollar(c.ohPayrollPerHour)} muted />
              <ResultRow label="Other Overhead/hr" value={fmtDollar(c.otherOHPerHour)} muted />
              <ResultRow label="Liabilities/hr" value={fmtDollar(c.liabilitiesPerHour)} muted />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="Fixed OH / Reg Hr" value={fmtDollar(c.ohPerHour)} bold />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="Base Cost (if 100% billable)" value={fmtDollar(c.baseBreakEven)} muted />
              <ResultRow label={`Non-billable uplift (${fmtPct(inputs.nonBillablePct)} of hrs)`} value={`+${fmtDollar(c.nonBillablePerHour)}`} muted />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="Break-Even Rate" value={fmtDollar(c.breakEven)} bold />
              <ResultRow label="Loaded Labor Rate (LLR) — labor only, no overhead" value={fmtDollar(c.loadedLaborRate)} muted />
              <ResultRow label={`Profit (${fmtPct(inputs.profitPct)} of revenue)`} value={`+${fmtDollar(c.profitPerHour)}`} muted />
              <div className="my-2 border-t-2 border-border" />
              <ResultRow label="Bid Rate" value={fmtDollar(c.bidRate)} highlight bold />
            </div>
          </div>

          {/* Season summary */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-800 dark:text-neutral-100">Season Summary</h3>
            <div className="space-y-1.5">
              <ResultRow label="Total Direct Labor" value={fmtDollarWhole(c.totalDirectLabor)} muted />
              <ResultRow label="Payroll Burden" value={fmtDollarWhole(c.burdenAmount)} muted />
              <ResultRow label="Total Labor Cost" value={fmtDollarWhole(c.totalLaborCost)} bold />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="Total Overhead" value={fmtDollarWhole(c.totalOverhead)} bold />
              <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />
              <ResultRow label="Total Season Revenue" value={fmtDollarWhole(c.bidRate * c.billableHours)} bold />
              <ResultRow label="Total Season Profit" value={fmtDollarWhole(c.profitPerHour * c.billableHours)} muted />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-neutral-100">Rate Breakdown</h3>
          <p className="mb-4 text-xs text-muted-foreground">Components of the bid rate per billable hour</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={breakdownData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip content={<RateTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Direct Labor" stackId="a" fill="#60ab45" />
              <Bar dataKey="Payroll Burden" stackId="a" fill="#86efac" />
              <Bar dataKey="OH Payroll" stackId="a" fill="#93c5fd" />
              <Bar dataKey="Other OH" stackId="a" fill="#818cf8" />
              <Bar dataKey="Liabilities" stackId="a" fill="#a78bfa" />
              <Bar dataKey="Profit" stackId="a" fill="#fbbf24" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-neutral-100">Cost Composition</h3>
          <p className="mb-4 text-xs text-muted-foreground">Share of each cost category in the bid rate</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmtDollar(v) + "/hr"} />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      {ratesPrompt && (
        <ApplyRatesToProjectsDialog
          open
          onOpenChange={(o) => {
            if (!o) setRatesPrompt(null);
          }}
          laborRateCents={ratesPrompt.full}
          burdenedRateCents={ratesPrompt.burdened}
        />
      )}
    </div>
  );
}

// ── Scenarios Tab ──────────────────────────────────────────────────────────────

/** Name field that edits locally and saves on blur / Enter — saving per
 *  keystroke would fire (and audit) a write for every character typed. */
function ScenarioNameInput({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  function commit() {
    const next = draft.trim();
    if (!next) { setDraft(name); return; }
    if (next !== name) onCommit(next);
  }

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      className="flex-1 rounded border border-transparent bg-transparent text-sm font-semibold text-slate-800 dark:text-neutral-100 hover:border-border focus:border-brand-300 dark:focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-300 dark:focus:ring-brand-700 px-1 py-0.5"
    />
  );
}

function ScenariosTab({
  scenarios,
  onLoad,
  isLoading,
}: {
  scenarios: JobCostingScenario[];
  onLoad: (s: JobCostingScenario) => void;
  isLoading: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Inputs>(BLANK_INPUTS);
  const create = useCreateJobCostingScenario();
  const update = useUpdateJobCostingScenario();
  const remove = useDeleteJobCostingScenario();
  const setDefault = useSetDefaultJobCostingScenario();

  const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

  function startEdit(s: JobCostingScenario) {
    setEditDraft({ ...s.inputs });
    setEditingId(s.id);
  }

  async function saveEdit(id: string) {
    try {
      await update.mutateAsync({ id, inputs: editDraft });
      setEditingId(null);
      toast.success("Scenario saved");
    } catch (e) {
      toast.error(errMsg(e, "Failed to save scenario"));
    }
  }

  async function addScenario() {
    try {
      const id = await create.mutateAsync({ name: "New Scenario", inputs: BLANK_INPUTS });
      setEditDraft({ ...BLANK_INPUTS });
      setEditingId(id);
    } catch (e) {
      toast.error(errMsg(e, "Failed to create scenario"));
    }
  }

  async function deleteScenario(s: JobCostingScenario) {
    const note = s.isDefault ? " It is the default, so the calculator will start blank until you pick another." : "";
    if (!window.confirm(`Delete “${s.name}”?${note}`)) return;
    try {
      if (editingId === s.id) setEditingId(null);
      await remove.mutateAsync(s.id);
    } catch (e) {
      toast.error(errMsg(e, "Failed to delete scenario"));
    }
  }

  async function renameScenario(id: string, name: string) {
    try {
      await update.mutateAsync({ id, name });
    } catch (e) {
      toast.error(errMsg(e, "Failed to rename scenario"));
    }
  }

  async function makeDefault(s: JobCostingScenario) {
    try {
      // Clicking the current default clears it.
      await setDefault.mutateAsync(s.isDefault ? null : s.id);
      if (!s.isDefault) {
        onLoad(s);
        toast.success(`“${s.name}” is now the default scenario`);
      }
    } catch (e) {
      toast.error(errMsg(e, "Failed to set default scenario"));
    }
  }

  const chartData = scenarios.map((s) => {
    const c = compute(s.inputs);
    return {
      name: s.name.length > 22 ? s.name.slice(0, 22) + "…" : s.name,
      "Labor/hr": parseFloat(c.laborPerHour.toFixed(2)),
      "Overhead/hr": parseFloat(c.ohPerHour.toFixed(2)),
      "Profit/hr": parseFloat(c.profitPerHour.toFixed(2)),
    };
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading scenarios…</p>;
  }

  return (
    <div className="space-y-6">
      {scenarios.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No scenarios yet. Create one to save a set of inputs, then use the star to make it the default shown on the Rate Calculator.
        </p>
      )}

      {scenarios.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800 dark:text-neutral-100">Scenario Comparison</h3>
          <p className="mb-4 text-xs text-muted-foreground">Bid rate breakdown across all scenarios</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} angle={-20} textAnchor="end" />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip content={<RateTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Labor/hr" stackId="a" fill="#60ab45" />
              <Bar dataKey="Overhead/hr" stackId="a" fill="#a78bfa" />
              <Bar dataKey="Profit/hr" stackId="a" fill="#fbbf24" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((s) => {
          const c = compute(s.inputs);
          const isEditing = editingId === s.id;

          return (
            <div key={s.id} className={`rounded-xl border bg-card shadow-sm transition-all ${isEditing ? "border-brand-300 dark:border-brand-700 ring-1 ring-brand-300 dark:ring-brand-700" : "border-border"}`}>
              {/* Card header */}
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-neutral-800 px-4 py-3">
                <ScenarioNameInput name={s.name} onCommit={(name) => renameScenario(s.id, name)} />
                {s.isDefault && (
                  <span className="shrink-0 rounded-full bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-400">
                    Default
                  </span>
                )}
                <div className="flex shrink-0 items-center gap-1">
                  {isEditing ? (
                    <>
                      <button type="button" onClick={() => saveEdit(s.id)} title="Save changes"
                        className="rounded p-1.5 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} title="Cancel"
                        className="rounded p-1.5 text-slate-400 dark:text-neutral-500 hover:bg-muted">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => makeDefault(s)} disabled={setDefault.isPending}
                        title={s.isDefault ? "Default scenario — click to clear" : "Set as the default scenario"}
                        className={`rounded p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/40 ${s.isDefault ? "text-amber-500 dark:text-amber-400" : "text-slate-400 dark:text-neutral-500 hover:text-amber-500 dark:hover:text-amber-400"}`}>
                        <Star className={`h-3.5 w-3.5 ${s.isDefault ? "fill-current" : ""}`} />
                      </button>
                      <button type="button" onClick={() => startEdit(s)} title="Edit inputs"
                        className="rounded p-1.5 text-slate-400 dark:text-neutral-500 hover:bg-muted hover:text-slate-700 dark:hover:text-neutral-300">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => onLoad(s)} title="Load into calculator"
                        className="rounded p-1.5 text-slate-400 dark:text-neutral-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 hover:text-brand-600 dark:hover:text-brand-400">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => deleteScenario(s)} title="Delete"
                        className="rounded p-1.5 text-slate-400 dark:text-neutral-500 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Bid rate banner */}
              <div className="bg-brand-500 px-4 py-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-100">Bid Rate</p>
                <p className="text-3xl font-bold text-white">{fmtDollar(c.bidRate)}<span className="text-base font-normal text-brand-200">/hr</span></p>
              </div>

              {isEditing ? (
                /* ── Inline editor ── */
                <div className="max-h-[480px] overflow-y-auto p-4">
                  <InputsForm inputs={editDraft} setInputs={setEditDraft} compact />
                  <button type="button" onClick={() => saveEdit(s.id)} disabled={update.isPending}
                    className="mt-4 w-full rounded-md bg-brand-500 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
                    {update.isPending ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              ) : (
                /* ── Summary view ── */
                <div className="p-4 space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Labor/hr</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtDollar(c.laborPerHour)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Fixed OH/reg hr</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtDollar(c.ohPerHour)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Break-even</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtDollar(c.breakEven)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">LLR</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtDollar(c.loadedLaborRate)}</span></div>
                  <div className="my-1.5 border-t border-slate-100 dark:border-neutral-800" />
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Employees</span><span className="font-medium text-slate-700 dark:text-neutral-300">{s.inputs.numFieldEmp}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Wage</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtDollar(s.inputs.fieldEmpWage)}/hr</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Billable Hrs</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtNum(c.billableHours)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Total OH</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtDollarWhole(c.totalOverhead)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Burden</span><span className="font-medium text-slate-700 dark:text-neutral-300">{fmtPct(c.burdenPct)}</span></div>
                  <div className="my-1.5 border-t border-slate-100 dark:border-neutral-800" />
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Season Revenue</span><span className="font-semibold text-slate-800 dark:text-neutral-100">{fmtDollarWhole(c.bidRate * c.billableHours)}</span></div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add scenario */}
        <button type="button" onClick={addScenario} disabled={create.isPending}
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-slate-400 dark:text-neutral-500 transition-colors hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-500 dark:hover:text-brand-400 disabled:opacity-50">
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium">New Scenario</span>
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export function JobCostingDashboard() {
  const [tab, setTab] = useState<Tab>("calculator");
  // The calculator form. Starts blank; replaced by the org's default scenario
  // once it loads (and again whenever the user loads or defaults a scenario).
  const [inputs, setInputs] = useState<Inputs>(BLANK_INPUTS);
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: scenarios = [], isLoading } = useJobCostingScenarios();
  const createScenario = useCreateJobCostingScenario();
  const updateScenario = useUpdateJobCostingScenario();

  const defaultScenario = scenarios.find((s) => s.isDefault) ?? null;
  const activeScenario = scenarios.find((s) => s.id === activeId) ?? null;

  // First load only: show the default scenario, unless the user already started
  // typing before the list arrived.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || isLoading) return;
    seeded.current = true;
    if (defaultScenario && inputsEqual(inputs, BLANK_INPUTS)) {
      setInputs(defaultScenario.inputs);
      setActiveId(defaultScenario.id);
    }
  }, [isLoading, defaultScenario, inputs]);

  const loadScenario = useCallback((s: JobCostingScenario) => {
    setInputs(s.inputs);
    setActiveId(s.id);
    setTab("calculator");
  }, []);

  const dirty = activeScenario != null && !inputsEqual(inputs, activeScenario.inputs);

  const TABS: { id: Tab; label: string }[] = [
    { id: "calculator", label: "Rate Calculator" },
    { id: "scenarios", label: `Scenarios (${scenarios.length})` },
  ];

  async function handleSaveScenario() {
    try {
      const id = await createScenario.mutateAsync({ name: "New Scenario", inputs: { ...inputs } });
      setActiveId(id);
      setTab("scenarios");
      toast.success("Scenario saved — rename it, or star it to make it the default");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save scenario");
    }
  }

  async function handleUpdateScenario() {
    if (!activeScenario) return;
    try {
      await updateScenario.mutateAsync({ id: activeScenario.id, inputs: { ...inputs } });
      toast.success(`“${activeScenario.name}” updated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update scenario");
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Job Costing"
        description="Calculate hourly bid rates from labor, overhead, and profit targets"
        action={
          tab === "calculator" ? (
            <button type="button" onClick={handleSaveScenario} disabled={createScenario.isPending}
              className="flex items-center gap-1.5 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
              <Plus className="h-4 w-4" />
              Save as Scenario
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-1 rounded-lg border border-border bg-slate-50 dark:bg-muted/40 p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? "bg-card text-slate-900 dark:text-neutral-100 shadow-sm" : "text-muted-foreground hover:text-slate-700 dark:hover:text-neutral-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calculator" && (
        <CalculatorTab
          inputs={inputs}
          setInputs={setInputs}
          scenarioName={activeScenario?.name ?? null}
          noScenarios={!isLoading && scenarios.length === 0}
          dirty={dirty}
          onUpdateScenario={handleUpdateScenario}
          updatingScenario={updateScenario.isPending}
        />
      )}
      {tab === "scenarios" && (
        <ScenariosTab scenarios={scenarios} onLoad={loadScenario} isLoading={isLoading} />
      )}
    </div>
  );
}
