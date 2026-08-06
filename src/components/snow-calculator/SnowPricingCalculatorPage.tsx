"use client";

import { useState } from "react";
import { formatCurrency } from "@/components/calculators/shared";

const LBS_PER_YARD_SALT = 2160;
const SQFT_PER_ACRE = 43560;
const SEASON_INCHES_ASSUMED = 60;

type MachineRow = {
  key: string;
  label: string;
  monthlyRate: number;
  months: number;
  qty: number;
};

const DEFAULT_MACHINES: MachineRow[] = [
  { key: "loader-184", label: "Loader - 184 size", monthlyRate: 2900, months: 4, qty: 0 },
  { key: "loader-244", label: "Loader - 244 size", monthlyRate: 3600, months: 4, qty: 1 },
  { key: "loader-344", label: "Loader - 344 size", monthlyRate: 4500, months: 4, qty: 0 },
  { key: "skid-wheeled", label: "Skid Steer - wheeled", monthlyRate: 2700, months: 4, qty: 0 },
  { key: "skid-tracked", label: "Skid Steer - tracked", monthlyRate: 3400, months: 4, qty: 0 },
  { key: "truck", label: "Truck", monthlyRate: 2500, months: 4, qty: 0.5 },
  { key: "ventrac", label: "Ventrac", monthlyRate: 1000, months: 4, qty: 0 },
];

function NumberField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  step = "any",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  prefix?: string;
  step?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
        {prefix && <span className="flex items-center pl-3 text-sm text-slate-400">{prefix}</span>}
        <input
          type="number"
          min="0"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-700 focus:outline-none"
          aria-label={label}
        />
        {suffix && <span className="flex items-center pr-3 text-sm text-slate-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtotal,
  children,
}: {
  title: string;
  subtotal: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h3>
        <span className="text-sm font-semibold text-brand-600">{formatCurrency(subtotal)}</span>
      </div>
      {children}
    </div>
  );
}

export function SnowPricingCalculatorPage() {
  // Salting
  const [saltSqFt, setSaltSqFt] = useState(50000);
  const [saltLbsPerAcre, setSaltLbsPerAcre] = useState(1000);
  const [saltCostPerYard, setSaltCostPerYard] = useState(650);
  const [saltApplications, setSaltApplications] = useState(30);

  // Ice melt
  const [iceBagsPerStorm, setIceBagsPerStorm] = useState(5);
  const [iceCostPerBag, setIceCostPerBag] = useState(20);
  const [iceApplications, setIceApplications] = useState(30);

  // Machines
  const [machines, setMachines] = useState<MachineRow[]>(DEFAULT_MACHINES);

  // Plowing
  const [plowOperators, setPlowOperators] = useState(1.5);
  const [plowHoursPerWinter, setPlowHoursPerWinter] = useState(75);
  const [plowRatePerHour, setPlowRatePerHour] = useState(100);

  // Shoveling
  const [shovelWorkers, setShovelWorkers] = useState(2);
  const [shovelHoursPerWinter, setShovelHoursPerWinter] = useState(75);
  const [shovelRatePerHour, setShovelRatePerHour] = useState(85);

  // Storage
  const [storageMonthly, setStorageMonthly] = useState(200);
  const [storageMonths, setStorageMonths] = useState(4);

  // Markup + per-storm pricing
  const [markupPct, setMarkupPct] = useState(5);
  const [baseRate1to3, setBaseRate1to3] = useState(2500);
  const [mult3to6, setMult3to6] = useState(1.7);
  const [mult6to9, setMult6to9] = useState(1.5);
  const [mult9to12, setMult9to12] = useState(1.3);
  const [mult12plus, setMult12plus] = useState(0.5);

  function updateMachine(key: string, patch: Partial<MachineRow>) {
    setMachines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  // Salting
  const saltAcres = saltSqFt / SQFT_PER_ACRE;
  const saltLbsPerApp = saltLbsPerAcre * saltAcres;
  const saltYardsPerApp = saltLbsPerApp / LBS_PER_YARD_SALT;
  const saltCostPerApp = saltYardsPerApp * saltCostPerYard;
  const saltSeasonTotal = saltCostPerApp * saltApplications;

  // Ice melt
  const iceCostPerStorm = iceBagsPerStorm * iceCostPerBag;
  const iceSeasonTotal = iceCostPerStorm * iceApplications;

  // Machines
  const machineTotal = machines.reduce((sum, m) => sum + m.monthlyRate * m.months * m.qty, 0);

  // Plowing
  const plowHours = plowOperators * plowHoursPerWinter;
  const plowTotal = plowHours * plowRatePerHour;

  // Shoveling
  const shovelHours = shovelWorkers * shovelHoursPerWinter;
  const shovelTotal = shovelHours * shovelRatePerHour;

  // Storage
  const storageTotal = storageMonthly * storageMonths;

  // Totals
  const subtotal = saltSeasonTotal + iceSeasonTotal + machineTotal + plowTotal + shovelTotal + storageTotal;
  const totalWithMarkup = subtotal + subtotal * (markupPct / 100);
  const perInchCost = (subtotal - saltSeasonTotal) / SEASON_INCHES_ASSUMED;

  // Per-storm-size pricing (chained off base rate, matching source spreadsheet)
  const rate1to3 = baseRate1to3;
  const rate3to6 = rate1to3 * mult3to6;
  const rate6to9 = rate3to6 * mult6to9;
  const rate9to12 = rate6to9 * mult9to12;
  const rate12plus = rate1to3 * mult12plus;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Snow Pricing Calculator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Estimate full-season snow & ice management costs and per-storm pricing.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Inputs */}
        <div className="space-y-4">
          <SectionCard title="Salting — Roads, Drive Lanes & Driveways" subtotal={saltSeasonTotal}>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Asphalt Area" value={saltSqFt} onChange={setSaltSqFt} suffix="sq. ft." />
              <NumberField label="Usage" value={saltLbsPerAcre} onChange={setSaltLbsPerAcre} suffix="lbs/acre" />
              <NumberField label="Cost" value={saltCostPerYard} onChange={setSaltCostPerYard} prefix="$" suffix="/yard" />
              <NumberField label="Applications" value={saltApplications} onChange={setSaltApplications} suffix="per season" />
            </div>
            <p className="text-xs text-muted-foreground">
              {saltAcres.toFixed(2)} acres · {saltYardsPerApp.toFixed(2)} yards/application ·{" "}
              {formatCurrency(saltCostPerApp)}/application
            </p>
          </SectionCard>

          <SectionCard title="Ice Melt" subtotal={iceSeasonTotal}>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Bags per Storm" value={iceBagsPerStorm} onChange={setIceBagsPerStorm} suffix="bags" />
              <NumberField label="Cost per Bag" value={iceCostPerBag} onChange={setIceCostPerBag} prefix="$" />
              <NumberField label="Applications" value={iceApplications} onChange={setIceApplications} suffix="per season" />
            </div>
            <p className="text-xs text-muted-foreground">{formatCurrency(iceCostPerStorm)}/storm</p>
          </SectionCard>

          <SectionCard title="Machines" subtotal={machineTotal}>
            <div className="space-y-3">
              {machines.map((m) => (
                <div key={m.key} className="grid grid-cols-[1fr_100px_70px_70px_90px] items-end gap-2">
                  <span className="pb-2.5 text-sm text-slate-600">{m.label}</span>
                  <NumberField
                    label="Rate"
                    value={m.monthlyRate}
                    onChange={(v) => updateMachine(m.key, { monthlyRate: v })}
                    prefix="$"
                  />
                  <NumberField
                    label="Months"
                    value={m.months}
                    onChange={(v) => updateMachine(m.key, { months: v })}
                  />
                  <NumberField label="Qty" value={m.qty} onChange={(v) => updateMachine(m.key, { qty: v })} />
                  <span className="pb-2.5 text-right text-sm font-medium text-slate-600">
                    {formatCurrency(m.monthlyRate * m.months * m.qty)}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-4 sm:grid-cols-2">
            <SectionCard title="Plowing" subtotal={plowTotal}>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Operators" value={plowOperators} onChange={setPlowOperators} />
                <NumberField label="Hours / Winter" value={plowHoursPerWinter} onChange={setPlowHoursPerWinter} />
                <NumberField label="Rate / Hour" value={plowRatePerHour} onChange={setPlowRatePerHour} prefix="$" />
              </div>
              <p className="text-xs text-muted-foreground">{plowHours.toFixed(1)} total hours</p>
            </SectionCard>

            <SectionCard title="Shoveling" subtotal={shovelTotal}>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Shovelers" value={shovelWorkers} onChange={setShovelWorkers} />
                <NumberField label="Hours / Winter" value={shovelHoursPerWinter} onChange={setShovelHoursPerWinter} />
                <NumberField label="Rate / Hour" value={shovelRatePerHour} onChange={setShovelRatePerHour} prefix="$" />
              </div>
              <p className="text-xs text-muted-foreground">{shovelHours.toFixed(1)} total hours</p>
            </SectionCard>
          </div>

          <SectionCard title="Storage Unit" subtotal={storageTotal}>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Monthly Rate" value={storageMonthly} onChange={setStorageMonthly} prefix="$" />
              <NumberField label="Months" value={storageMonths} onChange={setStorageMonths} />
            </div>
          </SectionCard>

          <div className="rounded-xl border bg-white p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">Per-Storm Pricing</h3>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="1-3 inches (base)" value={baseRate1to3} onChange={setBaseRate1to3} prefix="$" />
              <NumberField label="Markup %" value={markupPct} onChange={setMarkupPct} suffix="%" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <NumberField label="× for 3-6&quot;" value={mult3to6} onChange={setMult3to6} />
              <NumberField label="× for 6-9&quot;" value={mult6to9} onChange={setMult6to9} />
              <NumberField label="× for 9-12&quot;" value={mult9to12} onChange={setMult9to12} />
              <NumberField label="× for 12+&quot;" value={mult12plus} onChange={setMult12plus} />
            </div>
            <p className="text-xs text-muted-foreground">
              Includes plowing, shoveling, and one salt/ice application. 12+&quot; is priced as a fraction of the
              base rate, matching the source spreadsheet.
            </p>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden rounded-2xl shadow-lg">
            <div className="bg-sky-700 px-6 py-5">
              <h2 className="text-2xl font-extrabold uppercase tracking-tight text-white">Season Total</h2>
              <p className="mt-1 text-sm text-white/70">Full-season cost, with markup applied.</p>
            </div>
            <div className="bg-sky-700 space-y-3 p-6">
              <div className="flex items-center justify-between rounded-xl bg-white/10 px-5 py-4 backdrop-blur-sm">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-100">Sub-Total</span>
                <span className="text-2xl font-light text-white tabular-nums">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/10 px-5 py-4 backdrop-blur-sm">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-100">
                  Total ({markupPct}% markup)
                </span>
                <span className="text-2xl font-light text-white tabular-nums">{formatCurrency(totalWithMarkup)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white/10 px-5 py-4 backdrop-blur-sm">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-100">
                  Per Inch (÷{SEASON_INCHES_ASSUMED})
                </span>
                <span className="text-2xl font-light text-white tabular-nums">{formatCurrency(perInchCost)}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">Per-Storm Pricing</h3>
            <div className="space-y-2">
              {[
                ["1-3 inches", rate1to3],
                ["3-6 inches", rate3to6],
                ["6-9 inches", rate6to9],
                ["9-12 inches", rate9to12],
                ["12+ inches", rate12plus],
              ].map(([label, value]) => (
                <div key={label as string} className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
                  <span className="text-sm text-slate-600">{label}</span>
                  <span className="text-sm font-semibold text-slate-800">{formatCurrency(value as number)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 space-y-1.5">
            <h3 className="text-sm font-semibold">Formula Reference</h3>
            <p className="text-xs text-muted-foreground">Salt: (sq ft ÷ 43,560) × lbs/acre ÷ 2,160 lbs/yard × $/yard × applications</p>
            <p className="text-xs text-muted-foreground">Ice Melt: bags × $/bag × applications</p>
            <p className="text-xs text-muted-foreground">Machines: rate × months × qty, summed</p>
            <p className="text-xs text-muted-foreground">Labor: operators/workers × hours × rate</p>
            <p className="text-xs text-muted-foreground">Total = Sub-Total × (1 + Markup %)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
