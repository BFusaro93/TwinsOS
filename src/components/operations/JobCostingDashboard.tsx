"use client";

import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import {
  DollarSign, Users, Clock, TrendingUp, TrendingDown,
  Plus, Trash2, Copy, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Inputs {
  fieldEmpWage: number;
  fieldHrsReg: number;
  fieldHrsOT: number;
  numFieldEmp: number;
  ficaPct: number;
  workCompPct: number;
  suiPct: number;
  fuiPct: number;
  ohPayroll: number;
  otherOH: number;
  liabilities: number;
  nonBillablePct: number;
  profitPct: number;
}

interface Scenario {
  id: string;
  name: string;
  inputs: Inputs;
}

type Tab = "calculator" | "scenarios";

// ── Pre-seeded scenarios from Hourly Rate Pricing Worksheet ───────────────────

const DEFAULT_INPUTS: Inputs = {
  fieldEmpWage: 23,
  fieldHrsReg: 1280,
  fieldHrsOT: 320,
  numFieldEmp: 30,
  ficaPct: 7.65,
  workCompPct: 2.5,
  suiPct: 5.67,
  fuiPct: 0.6,
  ohPayroll: 170166,
  otherOH: 467139,
  liabilities: 305836,
  nonBillablePct: 20,
  profitPct: 20,
};

const PRESET_SCENARIOS: Scenario[] = [
  {
    id: "2026-landscape",
    name: "2026 Budget — Landscape Season",
    inputs: { ...DEFAULT_INPUTS },
  },
  {
    id: "2026-full-year",
    name: "2026 Budget — Full Year",
    inputs: {
      fieldEmpWage: 23,
      fieldHrsReg: 1280,
      fieldHrsOT: 320,
      numFieldEmp: 30,
      ficaPct: 7.65,
      workCompPct: 2.5,
      suiPct: 5.67,
      fuiPct: 0.6,
      ohPayroll: 170166,
      otherOH: 703012,
      liabilities: 459054,
      nonBillablePct: 20,
      profitPct: 20,
    },
  },
  {
    id: "2025-actual",
    name: "2025 Actual",
    inputs: {
      fieldEmpWage: 22.81,
      fieldHrsReg: 1280,
      fieldHrsOT: 320,
      numFieldEmp: 25,
      ficaPct: 7.65,
      workCompPct: 2.5,
      suiPct: 5.67,
      fuiPct: 0.6,
      ohPayroll: 90175,
      otherOH: 609377,
      liabilities: 391500,
      nonBillablePct: 20,
      profitPct: 20,
    },
  },
];

// ── Core calculation engine ───────────────────────────────────────────────────

interface Computed {
  totalRegHours: number;
  totalOTHours: number;
  totalHours: number;
  billableHours: number;
  directLaborReg: number;
  directLaborOT: number;
  totalDirectLabor: number;
  burdenPct: number;
  burdenAmount: number;
  totalLaborCost: number;
  totalOverhead: number;
  laborPerHour: number;
  ohPerHour: number;
  breakEven: number;
  bidRate: number;
  profitPerHour: number;
  laborShare: number;
  overheadShare: number;
  profitShare: number;
}

function compute(i: Inputs): Computed {
  const totalRegHours = i.numFieldEmp * i.fieldHrsReg;
  const totalOTHours = i.numFieldEmp * i.fieldHrsOT;
  const totalHours = totalRegHours + totalOTHours;
  const billableHours = totalHours * (1 - i.nonBillablePct / 100);

  const directLaborReg = totalRegHours * i.fieldEmpWage;
  const directLaborOT = totalOTHours * i.fieldEmpWage * 1.5;
  const totalDirectLabor = directLaborReg + directLaborOT;

  const burdenPct = i.ficaPct + i.workCompPct + i.suiPct + i.fuiPct;
  const burdenAmount = totalDirectLabor * (burdenPct / 100);
  const totalLaborCost = totalDirectLabor + burdenAmount;

  const totalOverhead = i.ohPayroll + i.otherOH + i.liabilities;

  const laborPerHour = billableHours > 0 ? totalLaborCost / billableHours : 0;
  const ohPerHour = billableHours > 0 ? totalOverhead / billableHours : 0;
  const breakEven = laborPerHour + ohPerHour;
  const bidRate = i.profitPct < 100 ? breakEven / (1 - i.profitPct / 100) : 0;
  const profitPerHour = bidRate - breakEven;

  const laborShare = bidRate > 0 ? (laborPerHour / bidRate) * 100 : 0;
  const overheadShare = bidRate > 0 ? (ohPerHour / bidRate) * 100 : 0;
  const profitShare = bidRate > 0 ? (profitPerHour / bidRate) * 100 : 0;

  return {
    totalRegHours, totalOTHours, totalHours, billableHours,
    directLaborReg, directLaborOT, totalDirectLabor,
    burdenPct, burdenAmount, totalLaborCost,
    totalOverhead, laborPerHour, ohPerHour,
    breakEven, bidRate, profitPerHour,
    laborShare, overheadShare, profitShare,
  };
}

// ── Formatters ─────────────────────────────────────────────────────────────────

const fmtDollar = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

const fmtDollarWhole = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtNum = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
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
}

function NumInput({ label, value, onChange, prefix, suffix, step = 1, min = 0, max, hint }: NumInputProps) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
        {label}
        {hint && (
          <span className="group relative cursor-help">
            <Info className="h-3 w-3 text-slate-400" />
            <span className="pointer-events-none absolute left-4 top-0 z-10 w-44 rounded-md border border-slate-200 bg-white p-2 text-[10px] text-slate-600 opacity-0 shadow-md transition-opacity group-hover:opacity-100">
              {hint}
            </span>
          </span>
        )}
      </label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-3 text-sm text-slate-400">{prefix}</span>
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
          className={`w-full rounded-md border border-slate-300 bg-white py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 ${prefix ? "pl-7 pr-3" : suffix ? "pl-3 pr-8" : "px-3"}`}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 text-sm text-slate-400">{suffix}</span>
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
    <div
      className={`flex items-center justify-between rounded-md px-3 py-2 ${
        highlight
          ? "bg-brand-500 text-white"
          : muted
          ? "text-slate-500"
          : "bg-slate-50"
      }`}
    >
      <span className={`text-sm ${bold || highlight ? "font-semibold" : "font-medium"} ${highlight ? "text-white" : muted ? "text-slate-500" : "text-slate-700"}`}>
        {label}
      </span>
      <span className={`text-sm ${bold || highlight ? "font-bold" : ""} ${highlight ? "text-white" : muted ? "text-slate-500" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function RateTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; fill: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-md text-xs">
      <p className="mb-1.5 font-semibold text-slate-700">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-medium text-slate-800">{fmtDollar(p.value)}/hr</span>
        </div>
      ))}
    </div>
  );
}

// ── Calculator Tab ─────────────────────────────────────────────────────────────

interface CalculatorTabProps {
  inputs: Inputs;
  setInputs: (i: Inputs) => void;
}

function CalculatorTab({ inputs, setInputs }: CalculatorTabProps) {
  const set = <K extends keyof Inputs>(k: K) => (v: number) =>
    setInputs({ ...inputs, [k]: v });

  const c = useMemo(() => compute(inputs), [inputs]);

  const [showBurden, setShowBurden] = useState(false);

  const breakdownData = [
    {
      name: "Bid Rate",
      "Regular Labor": parseFloat(c.directLaborReg > 0 ? (c.directLaborReg / c.billableHours).toFixed(2) : "0"),
      "OT Premium": parseFloat(c.totalOTHours > 0 ? ((c.directLaborOT - c.totalOTHours * inputs.fieldEmpWage) / c.billableHours).toFixed(2) : "0"),
      "Payroll Burden": parseFloat(c.billableHours > 0 ? (c.burdenAmount / c.billableHours).toFixed(2) : "0"),
      "Overhead": parseFloat(c.billableHours > 0 ? (c.totalOverhead / c.billableHours).toFixed(2) : "0"),
      "Profit": parseFloat(c.profitPerHour.toFixed(2)),
    },
  ];

  const pieData = [
    { name: "Regular Labor", value: c.directLaborReg / c.billableHours, color: "#60ab45" },
    { name: "OT Premium", value: (c.directLaborOT - c.totalOTHours * inputs.fieldEmpWage) / c.billableHours, color: "#86efac" },
    { name: "Payroll Burden", value: c.burdenAmount / c.billableHours, color: "#93c5fd" },
    { name: "Overhead", value: c.totalOverhead / c.billableHours, color: "#a78bfa" },
    { name: "Profit", value: c.profitPerHour, color: "#fbbf24" },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Bid Rate</p>
              <p className="mt-1 text-2xl font-bold text-brand-600">{fmtDollar(c.bidRate)}<span className="text-sm font-normal text-slate-400">/hr</span></p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
              <DollarSign className="h-5 w-5 text-brand-500" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Break-even + {fmtPct(inputs.profitPct)} margin</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Break-Even</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{fmtDollar(c.breakEven)}<span className="text-sm font-normal text-slate-400">/hr</span></p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <TrendingUp className="h-5 w-5 text-slate-500" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Labor {fmtDollar(c.laborPerHour)} + OH {fmtDollar(c.ohPerHour)}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Billable Hours</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{fmtNum(c.billableHours)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Clock className="h-5 w-5 text-slate-500" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{fmtPct(inputs.nonBillablePct)} non-billable of {fmtNum(c.totalHours)} total</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total Season Revenue</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{fmtDollarWhole(c.bidRate * c.billableHours)}</p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
              <Users className="h-5 w-5 text-slate-500" />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">At full utilization — {inputs.numFieldEmp} employees</p>
        </div>
      </div>

      {/* Two-column: inputs + results */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-5 text-sm font-semibold text-slate-800">Inputs</h3>

          <div className="space-y-5">
            <div>
              <SectionLabel>Field Labor</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="Wage ($/hr)" value={inputs.fieldEmpWage} onChange={set("fieldEmpWage")} prefix="$" step={0.01} />
                <NumInput label="# Field Employees" value={inputs.numFieldEmp} onChange={set("numFieldEmp")} step={1} min={1} />
                <NumInput label="Regular Hours / Employee" value={inputs.fieldHrsReg} onChange={set("fieldHrsReg")} step={40} hint="Total regular hours per employee for the period (e.g. 32 weeks × 40 hrs = 1,280)" />
                <NumInput label="OT Hours / Employee" value={inputs.fieldHrsOT} onChange={set("fieldHrsOT")} step={8} hint="Total overtime hours per employee for the period" />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowBurden(!showBurden)}
                className="mb-2 flex w-full items-center justify-between"
              >
                <SectionLabel>Payroll Burden — {fmtPct(inputs.ficaPct + inputs.workCompPct + inputs.suiPct + inputs.fuiPct)} total</SectionLabel>
                {showBurden ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
              </button>
              {showBurden && (
                <div className="grid grid-cols-2 gap-3">
                  <NumInput label="FICA %" value={inputs.ficaPct} onChange={set("ficaPct")} suffix="%" step={0.01} hint="Social Security (6.2%) + Medicare (1.45%) = 7.65%" />
                  <NumInput label="Work Comp %" value={inputs.workCompPct} onChange={set("workCompPct")} suffix="%" step={0.01} />
                  <NumInput label="SUI %" value={inputs.suiPct} onChange={set("suiPct")} suffix="%" step={0.01} hint="State Unemployment Insurance" />
                  <NumInput label="FUI %" value={inputs.fuiPct} onChange={set("fuiPct")} suffix="%" step={0.01} hint="Federal Unemployment Insurance" />
                </div>
              )}
            </div>

            <div>
              <SectionLabel>Overhead</SectionLabel>
              <div className="grid grid-cols-1 gap-3">
                <NumInput label="OH Payroll (admin/management)" value={inputs.ohPayroll} onChange={set("ohPayroll")} prefix="$" hint="Total payroll for non-field staff (office, management)" />
                <NumInput label="Other Overhead" value={inputs.otherOH} onChange={set("otherOH")} prefix="$" hint="Equipment, vehicles, insurance, rent, utilities, etc." />
                <NumInput label="Total Liabilities" value={inputs.liabilities} onChange={set("liabilities")} prefix="$" hint="Loan payments, notes payable, etc." />
              </div>
            </div>

            <div>
              <SectionLabel>Rate Parameters</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <NumInput label="Non-Billable %" value={inputs.nonBillablePct} onChange={set("nonBillablePct")} suffix="%" step={1} max={99} hint="Travel time, setup, breaks, etc. that can't be billed" />
                <NumInput label="Target Profit %" value={inputs.profitPct} onChange={set("profitPct")} suffix="%" step={1} max={99} hint="Profit as % of revenue (bid rate)" />
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="flex flex-col gap-4">
          {/* Rate breakdown card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Rate Calculation</h3>
            <div className="space-y-1.5">
              <ResultRow label="Regular Labor/hr" value={fmtDollar(c.directLaborReg / c.billableHours)} muted />
              <ResultRow label="OT Premium/hr" value={fmtDollar((c.directLaborOT - c.totalOTHours * inputs.fieldEmpWage) / c.billableHours)} muted />
              <ResultRow label={`Payroll Burden/hr (${fmtPct(c.burdenPct)} of labor)`} value={fmtDollar(c.burdenAmount / c.billableHours)} muted />
              <div className="my-1 border-t border-slate-100" />
              <ResultRow label="Labor / Billable Hour" value={fmtDollar(c.laborPerHour)} bold />
              <div className="my-1 border-t border-slate-100" />
              <ResultRow label="OH Payroll/hr" value={fmtDollar(inputs.ohPayroll / c.billableHours)} muted />
              <ResultRow label="Other Overhead/hr" value={fmtDollar(inputs.otherOH / c.billableHours)} muted />
              <ResultRow label="Liabilities/hr" value={fmtDollar(inputs.liabilities / c.billableHours)} muted />
              <div className="my-1 border-t border-slate-100" />
              <ResultRow label="Overhead / Billable Hour" value={fmtDollar(c.ohPerHour)} bold />
              <div className="my-1 border-t border-slate-100" />
              <ResultRow label="Break-Even Rate" value={fmtDollar(c.breakEven)} bold />
              <ResultRow label={`Profit (${fmtPct(inputs.profitPct)} of revenue)`} value={fmtDollar(c.profitPerHour)} muted />
              <div className="my-2 border-t-2 border-slate-200" />
              <ResultRow label="Bid Rate" value={fmtDollar(c.bidRate)} highlight bold />
            </div>
          </div>

          {/* Season summary card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-slate-800">Season Summary</h3>
            <div className="space-y-1.5">
              <ResultRow label="Total Direct Labor" value={fmtDollarWhole(c.totalDirectLabor)} muted />
              <ResultRow label="Payroll Burden" value={fmtDollarWhole(c.burdenAmount)} muted />
              <ResultRow label="Total Labor Cost" value={fmtDollarWhole(c.totalLaborCost)} bold />
              <div className="my-1 border-t border-slate-100" />
              <ResultRow label="Total Overhead" value={fmtDollarWhole(c.totalOverhead)} bold />
              <div className="my-1 border-t border-slate-100" />
              <ResultRow label="Total Season Revenue" value={fmtDollarWhole(c.bidRate * c.billableHours)} bold />
              <ResultRow label="Total Season Profit" value={fmtDollarWhole(c.profitPerHour * c.billableHours)} muted />
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Stacked bar breakdown */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Rate Breakdown</h3>
          <p className="mb-4 text-xs text-slate-500">Components of the bid rate per billable hour</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={breakdownData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <Tooltip content={<RateTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Regular Labor" stackId="a" fill="#60ab45" radius={[0,0,0,0]} />
              <Bar dataKey="OT Premium" stackId="a" fill="#86efac" />
              <Bar dataKey="Payroll Burden" stackId="a" fill="#93c5fd" />
              <Bar dataKey="Overhead" stackId="a" fill="#a78bfa" />
              <Bar dataKey="Profit" stackId="a" fill="#fbbf24" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Cost Composition</h3>
          <p className="mb-4 text-xs text-slate-500">Share of each cost category in the bid rate</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtDollar(v) + "/hr"} />
            </PieChart>
          </ResponsiveContainer>
          {/* Legend */}
          <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scenarios Tab ──────────────────────────────────────────────────────────────

interface ScenariosTabProps {
  scenarios: Scenario[];
  setScenarios: (s: Scenario[]) => void;
  onLoad: (inputs: Inputs) => void;
}

function ScenariosTab({ scenarios, setScenarios, onLoad }: ScenariosTabProps) {
  function addScenario() {
    const s: Scenario = {
      id: crypto.randomUUID(),
      name: `Scenario ${scenarios.length + 1}`,
      inputs: { ...DEFAULT_INPUTS },
    };
    setScenarios([...scenarios, s]);
  }

  function deleteScenario(id: string) {
    setScenarios(scenarios.filter((s) => s.id !== id));
  }

  function updateName(id: string, name: string) {
    setScenarios(scenarios.map((s) => (s.id === id ? { ...s, name } : s)));
  }

  const chartData = scenarios.map((s) => {
    const c = compute(s.inputs);
    return {
      name: s.name.length > 20 ? s.name.slice(0, 20) + "…" : s.name,
      "Labor/hr": parseFloat(c.laborPerHour.toFixed(2)),
      "Overhead/hr": parseFloat(c.ohPerHour.toFixed(2)),
      "Profit/hr": parseFloat(c.profitPerHour.toFixed(2)),
      bidRate: parseFloat(c.bidRate.toFixed(2)),
    };
  });

  return (
    <div className="space-y-6">
      {/* Comparison chart */}
      {scenarios.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-800">Scenario Comparison</h3>
          <p className="mb-4 text-xs text-slate-500">Bid rate breakdown across all scenarios</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 40 }}>
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

      {/* Scenario cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((s) => {
          const c = compute(s.inputs);
          return (
            <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              {/* Name row */}
              <div className="mb-4 flex items-start gap-2">
                <input
                  value={s.name}
                  onChange={(e) => updateName(s.id, e.target.value)}
                  className="flex-1 rounded border border-transparent bg-transparent text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-300 px-1"
                />
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => onLoad(s.inputs)}
                    title="Load into calculator"
                    className="rounded p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteScenario(s.id)}
                    title="Delete scenario"
                    className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Bid rate */}
              <div className="mb-4 rounded-lg bg-brand-500 px-4 py-3 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-100">Bid Rate</p>
                <p className="text-3xl font-bold text-white">{fmtDollar(c.bidRate)}<span className="text-base font-normal text-brand-200">/hr</span></p>
              </div>

              {/* Key metrics */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Labor/hr</span>
                  <span className="font-medium text-slate-700">{fmtDollar(c.laborPerHour)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Overhead/hr</span>
                  <span className="font-medium text-slate-700">{fmtDollar(c.ohPerHour)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Break-even</span>
                  <span className="font-medium text-slate-700">{fmtDollar(c.breakEven)}</span>
                </div>
                <div className="my-1.5 border-t border-slate-100" />
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Employees</span>
                  <span className="font-medium text-slate-700">{s.inputs.numFieldEmp}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Wage</span>
                  <span className="font-medium text-slate-700">{fmtDollar(s.inputs.fieldEmpWage)}/hr</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Billable Hrs</span>
                  <span className="font-medium text-slate-700">{fmtNum(c.billableHours)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Total OH</span>
                  <span className="font-medium text-slate-700">{fmtDollarWhole(c.totalOverhead)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Profit Margin</span>
                  <span className="font-medium text-slate-700">{fmtPct(s.inputs.profitPct)}</span>
                </div>
                <div className="my-1.5 border-t border-slate-100" />
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Season Revenue</span>
                  <span className="font-semibold text-slate-800">{fmtDollarWhole(c.bidRate * c.billableHours)}</span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add scenario button */}
        <button
          type="button"
          onClick={addScenario}
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-brand-300 hover:text-brand-500"
        >
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
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [scenarios, setScenarios] = useState<Scenario[]>(PRESET_SCENARIOS);

  const TABS: { id: Tab; label: string }[] = [
    { id: "calculator", label: "Rate Calculator" },
    { id: "scenarios", label: `Scenarios (${scenarios.length})` },
  ];

  function handleSaveScenario() {
    const s: Scenario = {
      id: crypto.randomUUID(),
      name: "New Scenario",
      inputs: { ...inputs },
    };
    setScenarios([...scenarios, s]);
    setTab("scenarios");
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Job Costing"
        description="Calculate hourly bid rates from labor, overhead, and profit targets"
        action={
          tab === "calculator" ? (
            <button
              type="button"
              onClick={handleSaveScenario}
              className="flex items-center gap-1.5 rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
            >
              <Plus className="h-4 w-4" />
              Save as Scenario
            </button>
          ) : undefined
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "calculator" && (
        <CalculatorTab inputs={inputs} setInputs={setInputs} />
      )}
      {tab === "scenarios" && (
        <ScenariosTab
          scenarios={scenarios}
          setScenarios={setScenarios}
          onLoad={(i) => { setInputs(i); setTab("calculator"); }}
        />
      )}
    </div>
  );
}
