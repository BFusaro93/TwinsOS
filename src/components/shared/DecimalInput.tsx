"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A numeric input that keeps a local text buffer while focused, so a
 * re-render driven by the committed numeric value never fights an
 * in-progress keystroke. A plain `<input type="number" value={n}>` forces
 * its displayed text back to `String(n)` on every render — so backspacing
 * a field down to empty (which parses to 0) immediately snaps back to "0"
 * before the next backspace can remove it, making the last digit feel stuck.
 * Only commits (and normalizes/clamps) the value on blur.
 */
export function DecimalInput({
  value,
  onCommit,
  min,
  className,
  autoFocus,
  selectOnFocus,
}: {
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  className?: string;
  autoFocus?: boolean;
  selectOnFocus?: boolean;
}) {
  const [text, setText] = useState(() => String(value));
  const [focused, setFocused] = useState(false);

  const displayValue = focused ? text : String(value);

  return (
    <Input
      type="number"
      step="any"
      min={min}
      autoFocus={autoFocus}
      className={className}
      value={displayValue}
      onFocus={(e) => {
        setFocused(true);
        setText(String(value));
        if (selectOnFocus) e.target.select();
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const parsed = parseFloat(text);
        const fallback = min ?? 0;
        onCommit(Number.isFinite(parsed) ? Math.max(min ?? -Infinity, parsed) : fallback);
      }}
    />
  );
}
