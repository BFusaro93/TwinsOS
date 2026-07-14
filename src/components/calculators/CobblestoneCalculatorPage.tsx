"use client";

import { useState } from "react";
import { Blocks } from "lucide-react";
import { type Unit, toFeet, fmt, formatCurrency, DimensionInput, ResultCard } from "./shared";

// ── Cobblestone size configs ────────────────────────────────────────────────
// lengthIn is the dimension that runs along the border — used as the
// per-cobble linear coverage in the "border length ÷ cobble length" formula.
const COBBLE_SIZES = [
  { id: "9x5x5", label: '9" x 5" x 5"', lengthIn: 9 },
  { id: "8x4x4", label: '8" x 4" x 4"', lengthIn: 8 },
] as const;

type CobbleSizeId = (typeof COBBLE_SIZES)[number]["id"];

// Volume pricing tier: $13/cobble once the order reaches 76+ cobbles.
const BULK_THRESHOLD = 76;
const STANDARD_PRICE = 14;
const BULK_PRICE = 13;
const DEFAULT_BUFFER = 4;

export function CobblestoneCalculatorPage() {
  const [sizeId, setSizeId] = useState<CobbleSizeId>("9x5x5");
  const [length, setLength] = useState("");
  const [lengthUnit, setLengthUnit] = useState<Unit>("ft");
  const [buffer, setBuffer] = useState(String(DEFAULT_BUFFER));

  const size = COBBLE_SIZES.find((s) => s.id === sizeId)!;

  const lengthIn = toFeet(parseFloat(length) || 0, lengthUnit) * 12;
  const bufferCount = Math.max(0, Math.round(parseFloat(buffer) || 0));

  const cobblesNeeded = lengthIn > 0 ? Math.ceil(lengthIn / size.lengthIn) : 0;
  const totalCobbles = cobblesNeeded > 0 ? cobblesNeeded + bufferCount : 0;
  // Tier is based on cobbles needed, not the buffer-inflated total — the buffer
  // is a safety margin and shouldn't push a job into the bulk price tier.
  const pricePerCobble = cobblesNeeded >= BULK_THRESHOLD ? BULK_PRICE : STANDARD_PRICE;
  const totalPrice = totalCobbles * pricePerCobble;

  const hasValues = lengthIn > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Cobblestone Calculator</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Estimate cobblestones needed and billing amount for a border run.
        </p>
      </div>

      {/* Size selector */}
      <div className="grid grid-cols-2 gap-3">
        {COBBLE_SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSizeId(s.id)}
            className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-all ${
              sizeId === s.id
                ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            <Blocks className={`h-5 w-5 shrink-0 ${sizeId === s.id ? "text-brand-500" : "text-slate-400"}`} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Calculator */}
      <div className="overflow-hidden rounded-2xl shadow-lg">
        <div className="bg-stone-600 px-6 py-5">
          <h2 className="text-3xl font-extrabold uppercase tracking-tight text-white">Cobblestone Border</h2>
          <p className="mt-1 text-sm text-white/70">
            Enter the border length to calculate cobblestones needed and the amount to bill.
          </p>
        </div>

        <div className="grid md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-5 bg-slate-50 p-6">
            <DimensionInput
              label="Border Length"
              value={length}
              unit={lengthUnit}
              onValue={setLength}
              onUnit={setLengthUnit}
            />
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-600">Extra Cobbles (buffer)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none"
                aria-label="Extra cobbles buffer"
              />
              <p className="text-xs text-slate-400">
                Add 3–4 extra cobblestones to account for smaller sizing variance.
              </p>
            </div>
          </div>

          {/* Results */}
          <div className="bg-stone-600 space-y-3 p-6">
            <ResultCard label="Cobbles Needed" value={hasValues ? fmt(cobblesNeeded, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"} />
            <ResultCard label="Total w/ Buffer" value={hasValues ? fmt(totalCobbles, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "—"} />
            <ResultCard label="Price / Cobble" value={hasValues ? formatCurrency(pricePerCobble) : "—"} />
            <ResultCard label="Amount to Bill" value={hasValues ? formatCurrency(totalPrice) : "—"} />
          </div>
        </div>
      </div>

      {/* Reference table */}
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold">Pricing & Formula Reference</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Order Size</th>
              <th className="pb-2 font-medium">Price per Cobble</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-2 pr-4 font-medium">Up to 75 cobbles</td>
              <td className="py-2 text-muted-foreground">{formatCurrency(STANDARD_PRICE)}</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">76 or more cobbles</td>
              <td className="py-2 text-muted-foreground">{formatCurrency(BULK_PRICE)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground pt-1">
          Formula: border length (ft) × 12 ÷ cobblestone length (in) = cobbles needed, rounded up.
        </p>
      </div>
    </div>
  );
}
