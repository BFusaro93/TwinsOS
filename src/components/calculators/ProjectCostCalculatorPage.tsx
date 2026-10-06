"use client";

import { useState } from "react";
import { formatCurrency, ResultCard } from "./shared";

const DEFAULT_MARKUP = 20;
const MAX_MARKUP = 100;

function CurrencyField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-600 dark:text-neutral-400">{label}</label>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 dark:border-neutral-700 bg-card shadow-sm">
        <span className="flex items-center pl-3 text-sm text-slate-400 dark:text-neutral-500">$</span>
        <input
          type="number"
          min="0"
          step="any"
          placeholder={placeholder ?? "0.00"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent px-2 py-2.5 text-sm text-slate-700 dark:text-neutral-300 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none"
          aria-label={`${label} value`}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-600 dark:text-neutral-400">{label}</label>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 dark:border-neutral-700 bg-card shadow-sm">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-700 dark:text-neutral-300 placeholder:text-slate-400 dark:placeholder:text-neutral-500 focus:outline-none"
          aria-label={`${label} value`}
        />
        <span className="flex items-center pr-3 text-sm text-slate-400 dark:text-neutral-500">{suffix}</span>
      </div>
    </div>
  );
}

function MarkupControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-600 dark:text-neutral-400">Markup</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={MAX_MARKUP}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-brand-500"
          aria-label="Markup percent slider"
        />
        <div className="flex items-center overflow-hidden rounded-lg border border-slate-300 dark:border-neutral-700 bg-card shadow-sm">
          <input
            type="number"
            min={0}
            max={MAX_MARKUP}
            step="any"
            value={value}
            onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 bg-transparent px-2.5 py-2 text-right text-sm text-slate-700 dark:text-neutral-300 focus:outline-none"
            aria-label="Markup percent value"
          />
          <span className="flex items-center pr-2.5 text-sm text-slate-400 dark:text-neutral-500">%</span>
        </div>
      </div>
    </div>
  );
}

export function ProjectCostCalculatorPage() {
  const [materialsCost, setMaterialsCost] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [laborRate, setLaborRate] = useState("");
  const [markup, setMarkup] = useState(DEFAULT_MARKUP);

  const materials = parseFloat(materialsCost) || 0;
  const hours = parseFloat(laborHours) || 0;
  const rate = parseFloat(laborRate) || 0;

  const laborCost = hours * rate;
  const baseCost = materials + laborCost;
  const markupAmount = baseCost * (markup / 100);
  const finalPrice = baseCost + markupAmount;
  const effectiveMargin = finalPrice > 0 ? (markupAmount / finalPrice) * 100 : 0;

  const hasValues = baseCost > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Project Cost Calculator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Combine material cost, labor, and markup to price out a job.
        </p>
      </div>

      {/* Calculator */}
      <div className="overflow-hidden rounded-2xl shadow-lg">
        <div className="bg-emerald-700 px-6 py-5">
          <h2 className="text-3xl font-extrabold uppercase tracking-tight text-white">Project Cost</h2>
          <p className="mt-1 text-sm text-white/70">
            Enter materials, labor, and markup to calculate the final project price.
          </p>
        </div>

        <div className="grid md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-5 bg-slate-50 dark:bg-muted/40 p-6">
            <CurrencyField label="Materials Cost" value={materialsCost} onChange={setMaterialsCost} />
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Labor Hours" value={laborHours} onChange={setLaborHours} suffix="hrs" />
              <CurrencyField label="Labor Rate" value={laborRate} onChange={setLaborRate} placeholder="0.00/hr" />
            </div>
            <MarkupControl value={markup} onChange={setMarkup} />
          </div>

          {/* Results */}
          <div className="bg-emerald-700 space-y-3 p-6">
            <ResultCard label="Labor Cost" value={hasValues ? formatCurrency(laborCost) : "—"} />
            <ResultCard label="Total Cost" value={hasValues ? formatCurrency(baseCost) : "—"} />
            <ResultCard label="Markup Amount" value={hasValues ? formatCurrency(markupAmount) : "—"} />
            <ResultCard label="Final Price" value={hasValues ? formatCurrency(finalPrice) : "—"} />
          </div>
        </div>
      </div>

      {/* Reference */}
      <div className="rounded-xl border bg-card p-5 space-y-2">
        <h3 className="text-sm font-semibold">Formula Reference</h3>
        <p className="text-xs text-muted-foreground">
          Total Cost = Materials Cost + (Labor Hours × Labor Rate)
        </p>
        <p className="text-xs text-muted-foreground">
          Final Price = Total Cost × (1 + Markup %)
        </p>
        {hasValues && (
          <p className="text-xs text-muted-foreground">
            Effective profit margin on final price: {effectiveMargin.toFixed(1)}%
          </p>
        )}
      </div>
    </div>
  );
}
