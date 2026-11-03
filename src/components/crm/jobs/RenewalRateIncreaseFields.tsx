"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROUNDING_LABELS, type RoundingRule } from "@/lib/pricing/adjust";
import type { RenewalRateIncrease } from "@/lib/package-renewal";

/** Parses the "Raise rates by" box: blank / 0 = no raise; null = not a valid percent. */
export function parseRenewalRateIncrease(percentText: string, rounding: RoundingRule): RenewalRateIncrease | null | undefined {
  const t = percentText.trim();
  if (t === "") return undefined;
  const percent = Number(t);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent === 0 ? undefined : { percent, rounding };
}

/** "Raise rates by [ ] %, rounded to [ ]" — shared by the single and bulk renew windows. */
export function RenewalRateIncreaseFields({
  percentText,
  onPercentTextChange,
  rounding,
  onRoundingChange,
  disabled,
}: {
  percentText: string;
  onPercentTextChange: (v: string) => void;
  rounding: RoundingRule;
  onRoundingChange: (v: RoundingRule) => void;
  disabled?: boolean;
}) {
  const invalid = parseRenewalRateIncrease(percentText, rounding) === null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-neutral-300">
      <span>Raise rates by</span>
      <Input
        aria-label="Raise rates by percent"
        inputMode="decimal"
        className="h-8 w-20 text-right"
        placeholder="0"
        value={percentText}
        disabled={disabled}
        onChange={(e) => onPercentTextChange(e.target.value)}
      />
      <span>%, rounded to</span>
      <Select value={rounding} onValueChange={(v) => onRoundingChange(v as RoundingRule)} disabled={disabled}>
        <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(ROUNDING_LABELS) as RoundingRule[]).map((r) => (
            <SelectItem key={r} value={r}>{ROUNDING_LABELS[r]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {invalid && <span className="text-xs text-red-600 dark:text-red-400">Enter a percent from 0 to 100</span>}
    </div>
  );
}
