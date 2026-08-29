"use client";

import { useRef, useState } from "react";
import { useUsers } from "@/lib/hooks/use-users";
import { mentionToken } from "@/lib/mentions";
import { getInitials, getAvatarColor } from "@/lib/utils";

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  dark?: boolean;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

interface MentionQuery {
  /** Index of the "@" that opened this query, within `value`. */
  start: number;
  text: string;
}

// Finds an in-progress "@query" immediately before the cursor, if any — the
// "@" must not be glued to a preceding word character (so emails like
// "a@b.com" don't trigger it), and the query itself can't contain
// whitespace/newlines (an unfinished mention ends at the next space).
function findActiveMentionQuery(text: string, cursor: number): MentionQuery | null {
  const upToCursor = text.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const query = upToCursor.slice(at + 1);
  if (/[\s]/.test(query)) return null;
  const charBefore = at > 0 ? upToCursor[at - 1] : "";
  if (charBefore && /\w/.test(charBefore)) return null;
  return { start: at, text: query };
}

/** Textarea with @-mention autocomplete. Selecting a user inserts a
 *  `@[Name](userId)` token (see src/lib/mentions.ts) into the plain-text value. */
export function MentionTextarea({
  value, onChange, placeholder, rows = 2, dark = false, className, onKeyDown,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { data: users } = useUsers();
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const matches = query
    ? (users ?? []).filter((u) => u.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 6)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const cursor = e.target.selectionStart ?? next.length;
    const active = findActiveMentionQuery(next, cursor);
    setQuery(active);
    setHighlighted(0);
  }

  function pick(user: { id: string; name: string }) {
    if (!query) return;
    const el = ref.current;
    const cursor = el?.selectionStart ?? value.length;
    const before = value.slice(0, query.start);
    const after = value.slice(cursor);
    const token = mentionToken(user.name, user.id) + " ";
    const next = before + token + after;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = before.length + token.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (query && matches.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => (h + 1) % matches.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => (h - 1 + matches.length) % matches.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(matches[highlighted]); return; }
      if (e.key === "Escape") { setQuery(null); return; }
    }
    onKeyDown?.(e);
  }

  return (
    <div className="relative flex-1">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {query && matches.length > 0 && (
        <div
          className={`absolute bottom-full left-0 z-20 mb-1 w-64 overflow-hidden rounded-md border shadow-lg ${
            dark ? "border-[#3a3a3a] bg-[#2a2a2a]" : "border-slate-200 bg-white"
          }`}
        >
          {matches.map((u, i) => {
            const initials = getInitials(u.name);
            const color = getAvatarColor(u.name);
            return (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(u); }}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm ${
                  i === highlighted
                    ? dark ? "bg-[#3a3a3a]" : "bg-slate-100"
                    : ""
                } ${dark ? "text-slate-100 hover:bg-[#3a3a3a]" : "text-slate-800 hover:bg-slate-50"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${color}`}>
                  {initials}
                </span>
                <span className="truncate">{u.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
