"use client";

export type Unit = "ft" | "in";

export function toFeet(value: number, unit: Unit) {
  return unit === "ft" ? value : value / 12;
}

export function fmt(n: number, opts?: Intl.NumberFormatOptions) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, ...opts });
}

export function formatCurrency(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function UnitToggle({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
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

export function DimensionInput({
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
        <div className="border-l border-slate-200">
          <UnitToggle value={unit} onChange={onUnit} />
        </div>
      </div>
    </div>
  );
}

export function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/10 px-5 py-4 backdrop-blur-sm">
      <span className="text-xs font-bold uppercase tracking-widest text-slate-300">{label}</span>
      <span className="text-3xl font-light text-white tabular-nums">{value}</span>
    </div>
  );
}
