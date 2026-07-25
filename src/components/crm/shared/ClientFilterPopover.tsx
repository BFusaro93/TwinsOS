"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  operatorsFor,
  defaultOperator,
  type FilterFieldDef,
  type FilterRow,
  type FilterOperator,
} from "@/lib/client-filters";

export function ClientFilterPopover({
  fields,
  rows,
  onRowsChange,
}: {
  fields: FilterFieldDef[];
  rows: FilterRow[];
  onRowsChange: (rows: FilterRow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");

  function addRow() {
    onRowsChange([...rows, { id: crypto.randomUUID(), field: fields[0]?.value ?? "", operator: "eq", value: "" }]);
  }
  function removeRow(id: string) {
    onRowsChange(rows.filter((r) => r.id !== id));
  }
  function updateRow(id: string, patch: Partial<FilterRow>) {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function clearAll() {
    onRowsChange([]);
  }

  const activeCount = rows.filter((r) => r.value !== "").length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-9 gap-1.5 shrink-0", activeCount > 0 && "border-brand-500 text-brand-600")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]">{activeCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[540px] p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b bg-[#4a4a4a] rounded-t-md">
          <span className="text-sm font-semibold text-white">Filters</span>
          {rows.length > 0 && (
            <button onClick={clearAll} className="text-xs text-white/70 hover:text-white underline">
              Clear all
            </button>
          )}
        </div>
        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">
          {rows.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">No filters applied. Click &ldquo;+ Add Filter&rdquo; to start.</p>
          )}
          {rows.map((row) => {
            const fieldDef = fields.find((f) => f.value === row.field) ?? fields[0];
            const ops = operatorsFor(fieldDef.type);
            return (
              <div key={row.id} className="flex items-center gap-1.5">
                <Select
                  value={row.field}
                  onValueChange={(v) => {
                    const def = fields.find((f) => f.value === v) ?? fields[0];
                    updateRow(row.id, { field: v, operator: defaultOperator(def.type), value: "" });
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-44 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <div className="px-2 py-1.5 sticky top-0 bg-white border-b">
                      <Input
                        className="h-6 text-xs"
                        placeholder="Filter: Enter keywords"
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </div>
                    {fields
                      .filter((f) => !fieldSearch || f.label.toLowerCase().includes(fieldSearch.toLowerCase()))
                      .map((f) => (
                        <SelectItem key={f.value} value={f.value} className="text-xs">{f.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.operator}
                  onValueChange={(v) => updateRow(row.id, { operator: v as FilterOperator, value: "" })}
                >
                  <SelectTrigger className="h-7 text-xs w-44 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((op) => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1 min-w-0">
                  {fieldDef.type === "boolean" ? (
                    <Select value={row.value} onValueChange={(v) => updateRow(row.id, { value: v })}>
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes" className="text-xs">Yes</SelectItem>
                        <SelectItem value="no"  className="text-xs">No</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : fieldDef.type === "select" && fieldDef.options && fieldDef.options.length > 0 ? (
                    <Select value={row.value} onValueChange={(v) => updateRow(row.id, { value: v })}>
                      <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent className="max-h-48">
                        {fieldDef.options.map((opt) => (
                          <SelectItem key={opt.v} value={opt.v} className="text-xs">{opt.l}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : fieldDef.type === "date" ? (
                    <Input type="date" className="h-7 text-xs w-full" value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })} />
                  ) : fieldDef.type === "number" ? (
                    <Input type="number" className="h-7 text-xs w-full" placeholder="0.00" value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })} />
                  ) : (
                    <Input className="h-7 text-xs w-full" placeholder="Enter value…" value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })} />
                  )}
                </div>
                <button onClick={() => removeRow(row.id)} className="shrink-0 text-slate-400 hover:text-red-500 p-0.5">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t px-3 py-2">
          <button onClick={addRow} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            + Add Filter
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
