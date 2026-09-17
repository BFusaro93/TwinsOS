"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * One row in a checklist-style filter popover (Service/Crew/Tag/Priority,
 * etc). A plain clickable row, not a `<button>` — the Checkbox it wraps is
 * itself a button, and nesting a button inside a button is invalid HTML
 * that browsers silently mangle.
 */
export function FilterOptionRow({
  checked,
  onToggle,
  children,
  className,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-100",
        className
      )}
    >
      <Checkbox checked={checked} className="h-3.5 w-3.5 pointer-events-none" />
      {children}
    </div>
  );
}
