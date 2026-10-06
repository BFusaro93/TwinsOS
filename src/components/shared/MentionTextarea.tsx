"use client";

import { useMemo, useRef, useState } from "react";
import { useUsers } from "@/lib/hooks/use-users";
import { mentionToken, toDisplay, applyDisplayEdit, displayPositionToRaw } from "@/lib/mentions";
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
  /** Where to anchor the suggestion list, relative to the textarea wrapper. */
  anchor: { left: number; top: number; bottom: number; flip: boolean };
}

// Finds an in-progress "@query" immediately before the cursor, if any — the
// "@" must not be glued to a preceding word character (so emails like
// "a@b.com" don't trigger it), and the query itself can't contain
// whitespace/newlines (an unfinished mention ends at the next space).
function findActiveMentionQuery(text: string, cursor: number): Omit<MentionQuery, "anchor"> | null {
  const upToCursor = text.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const query = upToCursor.slice(at + 1);
  if (/[\s]/.test(query)) return null;
  const charBefore = at > 0 ? upToCursor[at - 1] : "";
  if (charBefore && /\w/.test(charBefore)) return null;
  return { start: at, text: query };
}

const MIRROR_PROPS = [
  "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight",
  "textTransform", "wordSpacing", "textIndent", "whiteSpace", "wordWrap", "overflowWrap", "tabSize",
] as const;

interface CaretPosition {
  left: number;
  /** Bottom edge of the caret's line, relative to the textarea's top. */
  bottom: number;
  /** Top edge of the caret's line, relative to the textarea's top. */
  top: number;
}

// Measures where the character at `index` renders inside the textarea by
// copying its text into an off-screen mirror element with identical styling.
function getCaretPosition(el: HTMLTextAreaElement, index: number): CaretPosition {
  const style = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  for (const prop of MIRROR_PROPS) mirror.style[prop] = style[prop];
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.textContent = el.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const pos = {
    left: marker.offsetLeft - el.scrollLeft,
    top: marker.offsetTop - el.scrollTop,
    bottom: marker.offsetTop - el.scrollTop + lineHeight,
  };
  document.body.removeChild(mirror);
  return pos;
}

const DROPDOWN_WIDTH = 256; // matches w-64
const DROPDOWN_MAX_HEIGHT = 220;

/** Textarea with @-mention autocomplete. The visible text always shows just
 *  "@Name" for a mention — the underlying value (passed to onChange) embeds
 *  the full `@[Name](userId)` token (see src/lib/mentions.ts) so the id
 *  survives for storage/notifications, without ever showing in the UI. */
export function MentionTextarea({
  value, onChange, placeholder, rows = 2, dark = false, className, onKeyDown,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const { data: users } = useUsers();
  const [query, setQuery] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const { display, ranges } = useMemo(() => toDisplay(value), [value]);

  const matches = query
    ? (users ?? []).filter((u) => u.name.toLowerCase().includes(query.text.toLowerCase())).slice(0, 6)
    : [];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextDisplay = e.target.value;
    const nextRaw = applyDisplayEdit(value, display, ranges, nextDisplay);
    onChange(nextRaw);
    const cursor = e.target.selectionStart ?? nextDisplay.length;
    const active = findActiveMentionQuery(nextDisplay, cursor);
    if (active) {
      const el = e.target;
      const caret = getCaretPosition(el, active.start);
      const maxLeft = Math.max(0, el.clientWidth - DROPDOWN_WIDTH);
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - (rect.top + caret.bottom);
      const spaceAbove = rect.top + caret.top;
      setQuery({
        ...active,
        anchor: {
          left: Math.min(Math.max(0, caret.left), maxLeft),
          top: caret.top,
          bottom: caret.bottom,
          flip: spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow,
        },
      });
    } else {
      setQuery(null);
    }
    setHighlighted(0);
  }

  function pick(user: { id: string; name: string }) {
    if (!query) return;
    const el = ref.current;
    const cursor = el?.selectionStart ?? display.length;
    const rawStart = displayPositionToRaw(query.start, ranges);
    const rawCursor = displayPositionToRaw(cursor, ranges);
    const token = mentionToken(user.name, user.id) + " ";
    const next = value.slice(0, rawStart) + token + value.slice(rawCursor);
    onChange(next);
    setQuery(null);
    const displayToken = `@${user.name} `;
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = query.start + displayToken.length;
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
        value={display}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        placeholder={placeholder}
        rows={rows}
        className={className}
      />
      {query && matches.length > 0 && (
        <div
          style={{
            left: query.anchor.left,
            ...(query.anchor.flip
              ? { bottom: `calc(100% - ${query.anchor.top}px + 4px)` }
              : { top: query.anchor.bottom + 4 }),
          }}
          className={`absolute z-20 w-64 overflow-hidden rounded-md border shadow-lg ${
            dark ? "border-[#3a3a3a] bg-[#2a2a2a]" : "border-border bg-card"
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
                    ? dark ? "bg-[#3a3a3a]" : "bg-muted"
                    : ""
                } ${dark ? "text-slate-100 hover:bg-[#3a3a3a]" : "text-slate-800 dark:text-neutral-100 hover:bg-slate-50 dark:hover:bg-muted/40"}`}
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
