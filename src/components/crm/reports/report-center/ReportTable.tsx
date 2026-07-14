"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type { ReportFieldType, ReportResult } from "@/types/crm-reports";

const PAGE_SIZE = 100;

const NUMERIC_TYPES: ReportFieldType[] = ["money", "number", "hours", "percent"];

/** Format a single cell for display (also used by CSV export). */
export function formatCellValue(value: unknown, type: ReportFieldType): string {
  if (value === null || value === undefined) return "—";
  switch (type) {
    case "money":
      return formatCurrency(Number(value));
    case "hours":
      return Number(value).toFixed(2);
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "number":
      return Number(value).toLocaleString();
    case "date":
      return formatDate(String(value));
    case "datetime": {
      const str = String(value);
      const d = new Date(str);
      if (isNaN(d.getTime())) return "—";
      const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `${formatDate(str)} ${time}`;
    }
    case "boolean":
      return value === true || value === "true" ? "Yes" : "No";
    default:
      return String(value);
  }
}

function Pager({
  page,
  pageCount,
  rowCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  rowCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground last:border-b-0 last:border-t print:hidden">
      <span className="tabular-nums">{rowCount.toLocaleString()} rows</span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="whitespace-nowrap tabular-nums">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ReportTable({ result }: { result: ReportResult }) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [result]);

  const pageCount = Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = result.rows.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );
  const showPager = result.rows.length > PAGE_SIZE;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {showPager && (
          <Pager
            page={safePage}
            pageCount={pageCount}
            rowCount={result.rowCount}
            onPageChange={setPage}
          />
        )}
        {result.rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            No rows for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {result.columns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5 whitespace-nowrap",
                        NUMERIC_TYPES.includes(col.type)
                          ? "text-right"
                          : "text-left"
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b last:border-0 hover:bg-slate-50"
                  >
                    {result.columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-3 py-2 text-slate-700",
                          NUMERIC_TYPES.includes(col.type) &&
                            "text-right tabular-nums"
                        )}
                      >
                        {formatCellValue(row[col.key], col.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {result.totals && (
                <tfoot>
                  <tr className="border-t bg-slate-50 font-medium text-slate-800">
                    {result.columns.map((col, i) => {
                      const total = result.totals?.[col.key];
                      const hasTotal = col.totalable && total !== undefined && total !== null;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5",
                            NUMERIC_TYPES.includes(col.type) &&
                              "text-right tabular-nums"
                          )}
                        >
                          {i === 0
                            ? "Totals"
                            : hasTotal
                              ? formatCellValue(total, col.type)
                              : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {showPager && (
          <Pager
            page={safePage}
            pageCount={pageCount}
            rowCount={result.rowCount}
            onPageChange={setPage}
          />
        )}
      </div>
      {result.notes && result.notes.length > 0 && (
        <ul className="space-y-0.5 px-1 text-[11px] text-muted-foreground">
          {result.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
