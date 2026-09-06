"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Parses whatever a person typed into a dollar field ("55", "$1,250.5",
 * " 12 ") into integer cents. Anything unparseable is 0 — never NaN, so
 * callers can add the result straight into totals.
 */
export function parseCurrencyToCents(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function formatCentsForInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Dollar-amount input backed by an integer-cents value.
 *
 * The classic bug this exists to kill (D-19): a controlled
 * `<input value={(cents / 100).toFixed(2)} onChange={parse}>` re-formats
 * after EVERY keystroke — typing "5" becomes "5.00", the next "5" lands
 * after the reformatted text as "5.005" and rounds to 5.01, so "55" saves
 * as $5.01 and "25" as $2.01. That is how a contract got persisted at
 * $2.01/mo and how Edit Payment mangled allocation amounts.
 *
 * Here the raw text the user typed is kept verbatim while the field is
 * focused; the formatted "0.00" view only replaces it on blur. Two
 * callbacks so both existing consumer styles keep working:
 *   - `onChange(cents)`  fires on every keystroke (parsed live) — for
 *     parents that validate/aggregate as the user types.
 *   - `onCommit(cents)`  fires once on blur / Enter with the normalized
 *     value — for parents that only want the final number.
 */
export function CurrencyInput({
  cents,
  onChange,
  onCommit,
  className,
  placeholder = "0.00",
  disabled,
  blankWhenZero = false,
  selectOnFocus = false,
  min = 0,
  id,
  "aria-label": ariaLabel,
}: {
  cents: number;
  onChange?: (cents: number) => void;
  onCommit?: (cents: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Render an empty field (not "0.00") when the value is 0 — for allocation grids. */
  blankWhenZero?: boolean;
  selectOnFocus?: boolean;
  /** Lower clamp applied on commit (cents). Default 0 — money fields don't go negative. */
  min?: number | null;
  id?: string;
  "aria-label"?: string;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  const formatted = blankWhenZero && cents === 0 ? "" : formatCentsForInput(cents);
  const displayValue = focused ? text : formatted;

  function clamp(value: number): number {
    return min == null ? value : Math.max(min, value);
  }

  function commit() {
    const next = clamp(parseCurrencyToCents(text));
    setFocused(false);
    if (next !== cents) onChange?.(next);
    onCommit?.(next);
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={ariaLabel}
      className={className}
      placeholder={placeholder}
      disabled={disabled}
      value={displayValue}
      onFocus={(e) => {
        setText(formatted);
        setFocused(true);
        if (selectOnFocus) e.target.select();
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        onChange?.(clamp(parseCurrencyToCents(raw)));
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
    />
  );
}
