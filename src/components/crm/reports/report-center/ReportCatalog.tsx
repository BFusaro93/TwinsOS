"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ALL_REPORTS } from "@/lib/reports/registry";
import { REPORT_SECTIONS } from "@/types/crm-reports";
import type { PrebuiltReportDef } from "@/lib/reports/definition-types";

function reportHref(def: PrebuiltReportDef): string {
  return def.href ?? `/crm/admin/reports/r/${def.key}`;
}

export function ReportCatalog() {
  const [search, setSearch] = useState("");

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return REPORT_SECTIONS.map((section) => ({
      ...section,
      reports: ALL_REPORTS.filter(
        (r) =>
          r.section === section.key &&
          (!q || `${r.name} ${r.description}`.toLowerCase().includes(q))
      ),
    })).filter((section) => section.reports.length > 0);
  }, [search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reports…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="w-[280px] px-4 py-2.5 text-left">Report</th>
                <th className="px-4 py-2.5 text-left">Description</th>
              </tr>
            </thead>
            <tbody>
              {sections.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-12 text-center text-sm text-slate-400"
                  >
                    No reports match your search.
                  </td>
                </tr>
              ) : (
                sections.map((section) => (
                  <SectionRows
                    key={section.key}
                    label={section.label}
                    reports={section.reports}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SectionRows({
  label,
  reports,
}: {
  label: string;
  reports: PrebuiltReportDef[];
}) {
  return (
    <>
      <tr className="border-b bg-muted">
        <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
          {label}
        </td>
      </tr>
      {reports.map((def) => (
        <tr key={def.key} className="border-b last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2.5 align-top">
            <Link
              href={reportHref(def)}
              className="font-medium text-blue-600 hover:underline"
            >
              {def.name}
            </Link>
          </td>
          <td className="px-4 py-2.5 align-top text-slate-600">
            {def.description}
          </td>
        </tr>
      ))}
    </>
  );
}
