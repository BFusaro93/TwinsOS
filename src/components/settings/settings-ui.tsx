"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";

export function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        enabled ? "bg-brand-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function BrandColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [draft, setDraft] = useState(color);

  // Keep draft in sync when color changes from outside (e.g. store resets)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(() => { setDraft(color); }, [color]);

  function commit(value: string) {
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      onChange(value);
    } else {
      setDraft(color); // revert to last valid
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => { onChange(e.target.value); setDraft(e.target.value); }}
        className="h-9 w-12 cursor-pointer rounded border border-slate-200 p-0.5"
        title="Pick a color"
      />
      <Input
        value={draft}
        maxLength={7}
        placeholder="#60ab45"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(draft); }}
        className="h-8 w-28 font-mono text-sm"
      />
      <div
        className="h-8 w-8 rounded border border-slate-200"
        style={{ backgroundColor: color }}
        title={color}
      />
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-4 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        )}
      </div>
      <div className="w-full md:w-48 md:shrink-0">{children}</div>
    </div>
  );
}
