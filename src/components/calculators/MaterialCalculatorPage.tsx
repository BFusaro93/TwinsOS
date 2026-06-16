"use client";

import { useState } from "react";
import { Layers, Gem, TreeDeciduous } from "lucide-react";

// ── Material configs ────────────────────────────────────────────────────────
// Density verified against SiteOne calculator outputs:
//   20ft × 30ft × 1in → 1.85 CY → rock 2.59 T, mulch 0.38 T
const MATERIALS = [
  {
    id: "decorative_rock",
    label: "Decorative Rock",
    densityTonsPerCY: 1.4,   // ~2,800 lbs/CY
    color: "from-stone-700 to-stone-900",
    Icon: Gem,
  },
  {
    id: "bark_mulch",
    label: "Bark & Mulch",
    densityTonsPerCY: 0.205, // ~410 lbs/CY
    color: "from-amber-800 to-stone-900",
    Icon: TreeDeciduous,
  },
  {
    id: "topsoil",
    label: "Topsoil",
    densityTonsPerCY: 1.1,   // ~2,200 lbs/CY loose topsoil
    color: "from-yellow-900 to-stone-900",
    Icon: Layers,
  },
] as const;

type MaterialId = (typeof MATERIALS)[number]["id"];
type Unit = "ft" | "in";

// ── Helpers ─────────────────────────────────────────────────────────────────
function toFeet(value: number, unit: Unit) {
  return unit === "ft" ? value : value / 12;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-components ──────────────────────────────────────────────────────────
function UnitToggle({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div className="flex overflow-hidden rounded border border-slate-300 text-xs font-semibold">
      {(["in", "ft"] as Unit[]).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange(u)}
          className={
            value === u
              ? "bg-brand-500 px-2.5 py-1.5 text-white"
              : "bg-white px-2.5 py-1.5 text-slate-500 hover:bg-slate-50"
          }
        >
          {u}
        </button>
      ))}
    </div>
  );
}

function DimensionInput({
  label,
  value,
  unit,
  onValue,
  onUnit,
}: {
  label: string;
  value: string;
  unit: Unit;
  onValue: (v: string) => void;
  onUnit: (u: Unit) => void;
}) {
  const display = value
    ? `${value} ${unit === "ft" ? "feet" : "inches"}`
    : "";

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-600">{label}</label>
      <div className="flex items-stretch gap-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
        <input
          type="number"
          min="0"
          step="any"
          placeholder={`Enter ${label.toLowerCase()}…`}
          value={value}
          onChange={(e) => onValue(e.target.value)}
          className="flex-1 bg-transparent px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
          aria-label={`${label} value`}
        />
        {value && (
          <span className="flex items-center pr-3 text-sm text-slate-400">
            {unit === "ft" ? "feet" : "inches"}
          </span>
        )}
        {!value && display === "" && null}
        <div className="border-l border-slate-200">
          <UnitToggle value={unit} onChange={onUnit} />
        </div>
      </div>
    </div>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/10 px-5 py-4 backdrop-blur-sm">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{label}</span>
      <span className="text-3xl font-light text-white tabular-nums">{value}</span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
export function MaterialCalculatorPage() {
  const [materialId, setMaterialId] = useState<MaterialId>("decorative_rock");
  const [length, setLength] = useState("");
  const [lengthUnit, setLengthUnit] = useState<Unit>("ft");
  const [width, setWidth] = useState("");
  const [widthUnit, setWidthUnit] = useState<Unit>("ft");
  const [depth, setDepth] = useState("");
  const [depthUnit, setDepthUnit] = useState<Unit>("in");

  const material = MATERIALS.find((m) => m.id === materialId)!;

  const l = toFeet(parseFloat(length) || 0, lengthUnit);
  const w = toFeet(parseFloat(width) || 0, widthUnit);
  const d = toFeet(parseFloat(depth) || 0, depthUnit);

  const sqFt = l * w;
  const cubicYards = sqFt * d / 27;
  const tons = cubicYards * material.densityTonsPerCY;

  const hasValues = l > 0 && w > 0 && d > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Material Calculators</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Estimate how much product you need for your project.
        </p>
      </div>

      {/* Material selector */}
      <div className="grid grid-cols-3 gap-3">
        {MATERIALS.map((m) => {
          const Icon = m.Icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMaterialId(m.id)}
              className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-left text-sm font-semibold transition-all ${
                materialId === m.id
                  ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${materialId === m.id ? "text-brand-500" : "text-slate-400"}`} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Calculator */}
      <div className="overflow-hidden rounded-2xl shadow-lg">
        <div className={`bg-gradient-to-br ${material.color} px-6 py-5`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/60">How much should I get?</span>
          </div>
          <h2 className="text-3xl font-extrabold uppercase tracking-tight text-white">{material.label}</h2>
          <p className="mt-1 text-sm text-white/70">
            Enter your project dimensions below to calculate how much material you need.
          </p>
        </div>

        <div className="grid md:grid-cols-2">
          {/* Inputs */}
          <div className="space-y-5 bg-slate-50 p-6">
            <DimensionInput
              label="Length"
              value={length}
              unit={lengthUnit}
              onValue={setLength}
              onUnit={setLengthUnit}
            />
            <DimensionInput
              label="Width"
              value={width}
              unit={widthUnit}
              onValue={setWidth}
              onUnit={setWidthUnit}
            />
            <DimensionInput
              label="Depth"
              value={depth}
              unit={depthUnit}
              onValue={setDepth}
              onUnit={setDepthUnit}
            />
          </div>

          {/* Results */}
          <div className={`bg-gradient-to-br ${material.color} space-y-3 p-6`}>
            <ResultCard
              label="Square Feet"
              value={hasValues ? fmt(sqFt) : "—"}
            />
            <ResultCard
              label="Cubic Yards"
              value={hasValues ? fmt(cubicYards) : "—"}
            />
            <ResultCard
              label="Tons"
              value={hasValues ? fmt(tons) : "—"}
            />
          </div>
        </div>
      </div>

      {/* Reference table */}
      <div className="rounded-xl border bg-white p-5 space-y-3">
        <h3 className="text-sm font-semibold">Coverage Reference</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Material</th>
              <th className="pb-2 pr-4 font-medium">Density</th>
              <th className="pb-2 pr-4 font-medium">Typical Depth</th>
              <th className="pb-2 font-medium">Coverage (1 CY @ typical depth)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr>
              <td className="py-2 pr-4 font-medium">Decorative Rock</td>
              <td className="py-2 pr-4 text-muted-foreground">1.4 tons/CY</td>
              <td className="py-2 pr-4 text-muted-foreground">2–3 in</td>
              <td className="py-2 text-muted-foreground">~160–240 sq ft</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">Bark & Mulch</td>
              <td className="py-2 pr-4 text-muted-foreground">0.2 tons/CY</td>
              <td className="py-2 pr-4 text-muted-foreground">2–4 in</td>
              <td className="py-2 text-muted-foreground">~80–160 sq ft</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">Topsoil</td>
              <td className="py-2 pr-4 text-muted-foreground">1.1 tons/CY</td>
              <td className="py-2 pr-4 text-muted-foreground">4–6 in</td>
              <td className="py-2 text-muted-foreground">~50–80 sq ft</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
