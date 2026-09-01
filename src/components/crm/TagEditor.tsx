"use client";

import { useState, useRef, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  tags: string[];
  suggestions: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  disabled?: boolean;
  className?: string;
  /** Whether the user may commit a tag that isn't already in `suggestions`
   *  (gated by the `tags_create_tag` permission). Picking an existing
   *  suggestion is always allowed. Defaults to true. */
  canCreateNew?: boolean;
}

export function TagEditor({ tags, suggestions, onAdd, onRemove, disabled, className, canCreateNew = true }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    (s) => !tags.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  );

  function commit(value: string) {
    const trimmed = value.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    if (!canCreateNew && !suggestions.includes(trimmed)) return;
    onAdd(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commit(input); }
    if (e.key === "Escape") { setOpen(false); setInput(""); }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      onRemove(tags[tags.length - 1]);
    }
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
          {tag}
          {!disabled && (
            <button
              onClick={() => onRemove(tag)}
              className="rounded-full hover:bg-slate-300 p-0.5 transition-colors"
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </Badge>
      ))}

      {!disabled && !open && (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add tag
        </button>
      )}

      {!disabled && open && (
        <div className="relative">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { setTimeout(() => setOpen(false), 150); }}
            placeholder="Tag name…"
            className="h-6 w-32 px-2 text-xs"
          />
          {filtered.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-white shadow-md">
              {filtered.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commit(s); }}
                  className="flex w-full items-center px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {filtered.length === 0 && input.trim() && (
            <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-white shadow-md px-3 py-2 text-xs text-slate-400">
              {canCreateNew
                ? "No matching tags. Add tags in Settings."
                : "No matching tags. You don't have permission to create new tags."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
