"use client";

import { useState } from "react";
import { MaterialCalculatorPage } from "./MaterialCalculatorPage";
import { CobblestoneCalculatorPage } from "./CobblestoneCalculatorPage";

const MODES = [
  { id: "material", label: "Material" },
  { id: "cobblestone", label: "Cobblestone" },
] as const;

type ModeId = (typeof MODES)[number]["id"];

export function CalculatorsPage() {
  const [mode, setMode] = useState<ModeId>("material");

  return (
    <div className="space-y-6">
      <div className="flex overflow-hidden rounded-lg border border-slate-200 w-fit">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              mode === m.id
                ? "bg-brand-500 text-white"
                : "bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "material" ? <MaterialCalculatorPage /> : <CobblestoneCalculatorPage />}
    </div>
  );
}
