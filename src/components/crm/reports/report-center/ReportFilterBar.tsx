"use client";

import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useReportFilterOptions } from "@/lib/hooks/use-report-center";
import type { ReportFilterDef } from "@/types/crm-reports";

// ── date range presets ────────────────────────────────────────────────────────

const PRESET_OPTIONS = [
  { value: "this_month", label: "This Month" },
  { value: "last_30", label: "Last 30 Days" },
  { value: "last_90", label: "Last 90 Days" },
  { value: "this_year", label: "This Year" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom" },
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Compute the `from`/`to` (YYYY-MM-DD) window for a preset key. */
export function computePresetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  switch (preset) {
    case "this_month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case "last_30":
      return { from: iso(new Date(now.getTime() - 30 * 86400000)), to };
    case "last_90":
      return { from: iso(new Date(now.getTime() - 90 * 86400000)), to };
    case "this_year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
    default:
      // all_time / custom → no bounds
      return { from: "", to: "" };
  }
}

// ── field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </div>
  );
}

// ── individual controls ───────────────────────────────────────────────────────

function DateRangeControl({
  def,
  values,
  onChange,
}: {
  def: ReportFilterDef;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [preset, setPreset] = useState<string>(def.defaultValue ?? "this_month");

  const handlePreset = (next: string) => {
    setPreset(next);
    if (next === "custom") return;
    const { from, to } = computePresetRange(next);
    onChange("from", from);
    onChange("to", to);
  };

  return (
    <div className="flex items-end gap-2">
      <Field label={def.label}>
        <Select value={preset} onValueChange={handlePreset}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESET_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="From">
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={values.from ?? ""}
          onChange={(e) => {
            setPreset("custom");
            onChange("from", e.target.value);
          }}
        />
      </Field>
      <Field label="To">
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={values.to ?? ""}
          onChange={(e) => {
            setPreset("custom");
            onChange("to", e.target.value);
          }}
        />
      </Field>
    </div>
  );
}

function SelectControl({
  def,
  value,
  onChange,
}: {
  def: ReportFilterDef;
  value: string;
  onChange: (key: string, value: string) => void;
}) {
  const { data: dynamicOptions = [] } = useReportFilterOptions(
    def.options ? undefined : def.optionsSource
  );
  const options = def.options ?? dynamicOptions;

  return (
    <Field label={def.label}>
      <Select
        value={value || "all"}
        onValueChange={(v) => onChange(def.key, v === "all" ? "" : v)}
      >
        <SelectTrigger className="h-8 w-44 text-sm">
          <SelectValue placeholder="All" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// ── bar ───────────────────────────────────────────────────────────────────────

interface ReportFilterBarProps {
  filters: ReportFilterDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onRefresh: () => void;
  extraActions?: ReactNode;
}

export function ReportFilterBar({
  filters,
  values,
  onChange,
  onRefresh,
  extraActions,
}: ReportFilterBarProps) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <span className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Filter By
        </span>
        {filters.map((def) => {
          switch (def.type) {
            case "dateRange":
              return (
                <DateRangeControl
                  key={def.key}
                  def={def}
                  values={values}
                  onChange={onChange}
                />
              );
            case "select":
              return (
                <SelectControl
                  key={def.key}
                  def={def}
                  value={values[def.key] ?? ""}
                  onChange={onChange}
                />
              );
            case "number":
              return (
                <Field key={def.key} label={def.label}>
                  <Input
                    type="number"
                    className="h-8 w-32 text-sm"
                    value={values[def.key] ?? ""}
                    placeholder={def.placeholder}
                    onChange={(e) => onChange(def.key, e.target.value)}
                  />
                </Field>
              );
            case "checkbox":
              return (
                <div key={def.key} className="flex items-center gap-2 pb-2">
                  <Checkbox
                    id={`report-filter-${def.key}`}
                    checked={values[def.key] === "true"}
                    onCheckedChange={(checked) =>
                      onChange(def.key, checked === true ? "true" : "false")
                    }
                  />
                  <label
                    htmlFor={`report-filter-${def.key}`}
                    className="text-xs font-medium text-slate-600"
                  >
                    {def.label}
                  </label>
                </div>
              );
            default:
              return (
                <Field key={def.key} label={def.label}>
                  <Input
                    className="h-8 w-44 text-sm"
                    value={values[def.key] ?? ""}
                    placeholder={def.placeholder}
                    onChange={(e) => onChange(def.key, e.target.value)}
                  />
                </Field>
              );
          }
        })}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          {extraActions}
        </div>
      </div>
    </div>
  );
}
