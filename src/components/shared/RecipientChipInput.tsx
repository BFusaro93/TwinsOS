"use client";

import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { toast } from "sonner";
import { useRecipientSearch } from "@/lib/hooks/use-clients";

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface RecipientChipInputProps {
  label: string;
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder: string;
}

// Chip-style multi-email input with client/contact autocomplete, shared by
// the estimate and invoice send dialogs' To/CC fields.
export function RecipientChipInput({ label, emails, onChange, placeholder }: RecipientChipInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: suggestions = [] } = useRecipientSearch(inputValue);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function addEmail(email: string) {
    const trimmed = email.trim().replace(/,+$/, "");
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      toast.error(`"${trimmed}" is not a valid email address`);
      return;
    }
    if (!emails.includes(trimmed)) onChange([...emails, trimmed]);
    setInputValue("");
    setShowSuggestions(false);
  }

  function removeEmail(email: string) {
    onChange(emails.filter((e) => e !== email));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (inputValue.trim()) {
        e.preventDefault();
        addEmail(inputValue);
      }
    } else if (e.key === "Backspace" && inputValue === "" && emails.length > 0) {
      onChange(emails.slice(0, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  // Suggestions already added (by email) are hidden from the dropdown.
  const filteredSuggestions = suggestions.filter((s) => !emails.includes(s.email));

  return (
    <div ref={containerRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm cursor-text min-h-[38px]"
        onClick={() => inputRef.current?.focus()}
      >
        <span className="text-slate-400 text-xs font-medium w-8 shrink-0">{label}</span>
        {emails.map((email) => (
          <span
            key={email}
            className="flex items-center gap-1 bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 text-xs"
          >
            {email}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(email); }}
              className="text-slate-400 hover:text-slate-700 leading-none"
              aria-label={`Remove ${email}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputValue.trim()) addEmail(inputValue); }}
          placeholder={emails.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[160px] text-xs outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-md border bg-white py-1 shadow-lg max-h-56 overflow-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s.key}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addEmail(s.email); }}
              className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-slate-50"
            >
              <span className="text-xs font-medium text-slate-700">{s.name || s.email}</span>
              <span className="text-[11px] text-slate-400">{s.email} · {s.sublabel}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
