"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { expiringCredentials } from "@/lib/employees/credentials";
import type { CRMEmployee } from "@/types/crm-employees";

const WINDOW_DAYS = 60;

// Date-only value: anchor at noon so no timezone shifts it to the neighbouring day.
function formatDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dueLabel(daysLeft: number): string {
  if (daysLeft < 0) return `Expired ${-daysLeft} day${daysLeft === -1 ? "" : "s"} ago`;
  if (daysLeft === 0) return "Expires today";
  return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

/** Expired and soon-to-expire driver license / DOT physical / hoisting license dates. */
export function ExpiringCredentialsPanel({
  employees,
  onSelect,
}: {
  employees: CRMEmployee[];
  onSelect: (e: CRMEmployee) => void;
}) {
  const { today } = useOrgDates();
  const [open, setOpen] = useState(true);
  const rows = expiringCredentials(employees, today(), WINDOW_DAYS);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-medium">
          Credentials expired or expiring in the next {WINDOW_DAYS} days ({rows.length})
        </span>
        <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="divide-y border-t">
          {rows.map((r) => {
            const emp = employees.find((e) => e.id === r.employeeId);
            return (
              <li key={`${r.employeeId}-${r.kind}`}>
                <button
                  type="button"
                  onClick={() => emp && onSelect(emp)}
                  className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-muted/40"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                  <span className="w-36 shrink-0 text-muted-foreground">{r.label}</span>
                  <span className="w-28 shrink-0 text-muted-foreground">
                    {formatDate(r.date)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`w-40 shrink-0 justify-center border-0 ${
                      r.daysLeft < 0
                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                    }`}
                  >
                    {dueLabel(r.daysLeft)}
                  </Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
