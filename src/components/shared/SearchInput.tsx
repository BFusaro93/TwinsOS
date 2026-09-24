"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Merged onto the input — e.g. a different height or text size. */
  inputClassName?: string;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  autoFocus?: boolean;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  inputClassName,
  onFocus,
  autoFocus,
}: SearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Escape clears too — the × is the mouse path, this is the keyboard one.
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }
        }}
        onFocus={onFocus}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cn("h-9 pl-8 pr-8", inputClassName)}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          title="Clear search"
          className="absolute right-1 top-1/2 h-6 w-6 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          // Keep the cursor in the box so the next search can be typed straight away.
          onClick={() => { onChange(""); inputRef.current?.focus(); }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
