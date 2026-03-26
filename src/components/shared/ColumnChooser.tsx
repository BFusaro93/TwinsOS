"use client";

import { Check, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ColumnDef {
  key: string;
  label: string;
  /** Locked columns are always visible and cannot be hidden */
  locked?: boolean;
}

interface ColumnChooserProps {
  columns: ColumnDef[];
  visibleKeys: string[];
  onVisibleKeysChange: (keys: string[]) => void;
}

export function ColumnChooser({
  columns,
  visibleKeys,
  onVisibleKeysChange,
}: ColumnChooserProps) {
  function toggle(key: string) {
    onVisibleKeysChange(
      visibleKeys.includes(key)
        ? visibleKeys.filter((k) => k !== key)
        : [...visibleKeys, key]
    );
  }

  const toggleable = columns.filter((c) => !c.locked);
  const allVisible = toggleable.every((c) => visibleKeys.includes(c.key));
  const hiddenCount = toggleable.filter((c) => !visibleKeys.includes(c.key)).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-1.5",
            hiddenCount > 0 && "border-brand-400 text-brand-700"
          )}
        >
          <Columns3 className="h-3.5 w-3.5" />
          Columns
          {hiddenCount > 0 && (
            <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-xs font-medium leading-none text-brand-700">
              {hiddenCount} hidden
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-52">
        {columns.map((col) => {
          const isVisible = visibleKeys.includes(col.key);
          return (
            <DropdownMenuItem
              key={col.key}
              disabled={col.locked}
              onSelect={(e) => {
                e.preventDefault();
                if (!col.locked) toggle(col.key);
              }}
              className={cn(
                "flex items-center gap-2.5",
                col.locked ? "cursor-default opacity-50" : "cursor-pointer"
              )}
            >
              <div
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  isVisible
                    ? "border-brand-500 bg-brand-500"
                    : "border-slate-300 bg-white"
                )}
              >
                {isVisible && (
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                )}
              </div>
              <span>{col.label}</span>
              {col.locked && (
                <span className="ml-auto text-xs text-slate-400">Always shown</span>
              )}
            </DropdownMenuItem>
          );
        })}

        {!allVisible && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onVisibleKeysChange(columns.map((c) => c.key));
              }}
              className="cursor-pointer justify-center text-xs text-slate-500 hover:text-slate-700"
            >
              Show all columns
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
