"use client";

import { Switch } from "@/components/ui/switch";
import type { DisplaySettings } from "@/lib/estimate-display-settings";

export const DISPLAY_TOGGLES: { key: keyof DisplaySettings; label: string; description: string }[] = [
  { key: "showQuantities", label: "Quantities", description: "Show visit count and quantity/unit on each line" },
  { key: "showLinePrices", label: "Line prices", description: "Show the per-visit rate on each line" },
  { key: "showLineTotals", label: "Line totals", description: "Show each line item's total" },
  { key: "showSectionSubtotals", label: "Section subtotals", description: "Show a subtotal under each section" },
  { key: "hideZeroTotals", label: "Hide $0 totals", description: "Drop line items whose total is $0" },
  { key: "hideZeroPrices", label: "Hide $0 prices", description: "Hide the price on lines whose rate is $0 (e.g. included items)" },
];

export function EstimateDisplaySettingsPanel({
  settings,
  onChange,
  title = "What the client sees",
  description = "Controls the public proposal link, client portal, and PDF. Doesn't affect this internal editor.",
}: {
  settings: DisplaySettings;
  onChange: (next: DisplaySettings) => void;
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-medium text-slate-700">{title}</p>
        <p className="text-xs text-slate-400">{description}</p>
      </div>
      <div className="divide-y">
        {DISPLAY_TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm text-slate-700">{t.label}</p>
              <p className="text-xs text-slate-400">{t.description}</p>
            </div>
            <Switch
              checked={settings[t.key]}
              onCheckedChange={(v) => onChange({ ...settings, [t.key]: Boolean(v) })}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
