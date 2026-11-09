"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Filter as FilterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  filterOpsFor,
  isNumericType,
  type TableViewState,
  type ViewAlign,
  type ViewColumnFormat,
  type ViewFilter,
  type ViewNumberFormat,
} from "@/lib/reports/table-view";
import type { ReportColumnDef } from "@/types/crm-reports";

const NUMBER_FORMATS: { value: ViewNumberFormat; label: string }[] = [
  { value: "number", label: "###,###,##0.00" },
  { value: "currency", label: "$###,###,##0.00" },
  { value: "percent", label: "Percent" },
  { value: "timespan", label: "Timespan (h:mm)" },
  { value: "boolean", label: "True/False" },
  { value: "default", label: "No format" },
];

/**
 * The little menu on a report column header: sort, filter, hide, format and
 * merge duplicate cells. View-only — acts on the rows already on screen.
 */
export function ColumnHeaderMenu({
  col,
  view,
  canSort,
  onChange,
}: {
  col: ColumnHeaderMenuColumn;
  view: TableViewState;
  /** False in subtotal mode, where rows must stay grouped by section. */
  canSort: boolean;
  onChange: (next: TableViewState) => void;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const sorted = view.sort?.key === col.key ? view.sort.dir : null;
  const filter = view.filters[col.key];
  const fmt: ViewColumnFormat = view.formats[col.key] ?? {};
  const numeric = isNumericType(col.type);

  const setSort = (dir: "asc" | "desc") => onChange({ ...view, sort: { key: col.key, dir } });
  const setFormat = (patch: Partial<ViewColumnFormat>) => {
    const next: ViewColumnFormat = { ...fmt, ...patch };
    const cleaned: ViewColumnFormat = {};
    if (next.align) cleaned.align = next.align;
    if (next.number && next.number !== "default") cleaned.number = next.number;
    if (next.spectrum) cleaned.spectrum = true;
    if (next.bars) cleaned.bars = true;
    const formats = { ...view.formats };
    if (Object.keys(cleaned).length === 0) delete formats[col.key];
    else formats[col.key] = cleaned;
    onChange({ ...view, formats });
  };
  const setFilter = (next: ViewFilter | null) => {
    const filters = { ...view.filters };
    if (next) filters[col.key] = next;
    else delete filters[col.key];
    onChange({ ...view, filters });
  };
  const merged = view.merged.includes(col.key);

  return (
    <>
      <DropdownMenu>
        {
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "group inline-flex items-center gap-1 rounded px-0.5 font-semibold uppercase tracking-wide hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring print:pointer-events-none",
                (sorted || filter) && "text-foreground"
              )}
              aria-label={`${col.label} column options`}
            >
              <span>{col.label}</span>
              {sorted === "asc" && <ArrowUp className="h-3 w-3 shrink-0" />}
              {sorted === "desc" && <ArrowDown className="h-3 w-3 shrink-0" />}
              {filter && <FilterIcon className="h-3 w-3 shrink-0 text-primary" />}
              <ChevronDown className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60 print:hidden" />
            </button>
          </DropdownMenuTrigger>
        }
        <DropdownMenuContent align="start" className="w-52 normal-case tracking-normal">
          {canSort && (
            <>
              <DropdownMenuItem onSelect={() => setSort("asc")}>
                {numeric ? "Sort low → high" : "Sort A–Z"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSort("desc")}>
                {numeric ? "Sort high → low" : "Sort Z–A"}
              </DropdownMenuItem>
              {sorted && (
                <DropdownMenuItem onSelect={() => onChange({ ...view, sort: null })}>
                  Clear sort
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            onSelect={() => setFilterOpen(true)}
          >
            Filter{filter ? " (on)" : ""}…
          </DropdownMenuItem>
          {filter && (
            <DropdownMenuItem onSelect={() => setFilter(null)}>Clear filter</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Format</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-52">
              {(["left", "center", "right"] as ViewAlign[]).map((a) => (
                <DropdownMenuItem key={a} onSelect={() => setFormat({ align: a })}>
                  Align {a[0].toUpperCase() + a.slice(1)}
                  {fmt.align === a ? " ✓" : ""}
                </DropdownMenuItem>
              ))}
              {numeric && (
                <>
                  <DropdownMenuSeparator />
                  {NUMBER_FORMATS.map((f) => (
                    <DropdownMenuItem key={f.value} onSelect={() => setFormat({ number: f.value })}>
                      {f.label}
                      {(fmt.number ?? "default") === f.value ? " ✓" : ""}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setFormat({ spectrum: !fmt.spectrum, bars: false })}>
                    Color Spectrum{fmt.spectrum ? " ✓" : ""}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFormat({ bars: !fmt.bars, spectrum: false })}>
                    Bar Gauges{fmt.bars ? " ✓" : ""}
                  </DropdownMenuItem>
                </>
              )}
              {!numeric && col.type === "boolean" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setFormat({ number: "boolean" })}>
                    True/False{fmt.number === "boolean" ? " ✓" : ""}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setFormat({ number: "default" })}>No format</DropdownMenuItem>
                </>
              )}
              {Object.keys(fmt).length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      const formats = { ...view.formats };
                      delete formats[col.key];
                      onChange({ ...view, formats });
                    }}
                  >
                    Reset format
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem
            onSelect={() =>
              onChange({
                ...view,
                merged: merged ? view.merged.filter((k) => k !== col.key) : [...view.merged, col.key],
              })
            }
          >
            Merge Duplicate Cells{merged ? " ✓" : ""}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onChange({ ...view, hidden: [...view.hidden, col.key] })}>
            Hide Column
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-w-xs normal-case tracking-normal">
          <DialogHeader>
            <DialogTitle className="text-sm">Filter {col.label}</DialogTitle>
          </DialogHeader>
          <FilterEditor
            key={`${col.key}:${filterOpen}`}
            col={col}
            filter={filter}
            onApply={(f) => {
              setFilter(f);
              setFilterOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

type ColumnHeaderMenuColumn = Pick<ReportColumnDef, "key" | "label" | "type">;

function FilterEditor({
  col,
  filter,
  onApply,
}: {
  col: ColumnHeaderMenuColumn;
  filter: ViewFilter | undefined;
  onApply: (f: ViewFilter | null) => void;
}) {
  const ops = filterOpsFor(col.type);
  const [op, setOp] = useState<ViewFilter["op"]>(filter?.op ?? ops[0].value);
  const [value, setValue] = useState(filter?.value ?? "");
  const needsValue = op !== "empty" && op !== "not_empty";
  const inputType = isNumericType(col.type)
    ? "number"
    : col.type === "date" || col.type === "datetime"
      ? "date"
      : "text";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ op, value });
      }}
    >
      <Select value={op} onValueChange={(v) => setOp(v as ViewFilter["op"])}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {needsValue &&
        (col.type === "boolean" ? (
          <Select value={value || "true"} onValueChange={setValue}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Yes</SelectItem>
              <SelectItem value="false">No</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Input
            autoFocus
            type={inputType}
            step={inputType === "number" ? "any" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 text-sm"
            placeholder={col.type === "money" ? "Dollars, e.g. 150" : "Value"}
          />
        ))}
      <div className="flex justify-end gap-2 pt-1">
        {filter && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onApply(null)}>
            Clear
          </Button>
        )}
        <Button type="submit" size="sm" className="h-7 text-xs">
          Apply
        </Button>
      </div>
    </form>
  );
}
