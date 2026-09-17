"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DailyLoadListResult, DailyLoadListCrewGroup } from "@/lib/reports/materials/daily-load-list";

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function todayLocal(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function CrewCard({ crew }: { crew: DailyLoadListCrewGroup }) {
  return (
    <div className="rounded-lg border bg-white shadow-sm overflow-hidden break-inside-avoid">
      <div
        className="px-4 py-2.5 border-b flex items-center gap-2"
        style={{ backgroundColor: crew.crewColor ? `${crew.crewColor}1a` : undefined }}
      >
        {crew.crewColor && (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: crew.crewColor }} />
        )}
        <h2 className="text-sm font-bold text-slate-900">{crew.crewName}</h2>
      </div>

      {crew.chemicals.length > 0 && (
        <div className="px-4 py-3 border-b">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Chemicals to load</p>
          <table className="w-full text-xs">
            <tbody>
              {crew.chemicals.map((c) => (
                <tr key={c.productId} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-slate-800 align-top">{c.productName}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap align-top">
                    {fmtQty(c.concentrateQty)} {c.concentrateUnitName ?? ""}
                  </td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap text-slate-500 align-top">
                    {c.mixVolumeQty != null ? `≈ ${fmtQty(c.mixVolumeQty)} ${c.mixVolumeUnitName ?? ""} mixed` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crew.materials.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Materials to load</p>
          <table className="w-full text-xs">
            <tbody>
              {crew.materials.map((m) => (
                <tr key={m.productId} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-slate-800">{m.productName}</td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap">{fmtQty(m.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-2 bg-slate-50/60 border-t">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Stops</p>
        <p className="text-xs text-slate-500">
          {[
            ...new Set(
              [...crew.chemicals.flatMap((c) => c.visits), ...crew.materials.flatMap((m) => m.jobs)].map(
                (v) => v.clientName
              )
            ),
          ].join(", ")}
        </p>
      </div>
    </div>
  );
}

export default function DailyLoadListReportPage() {
  const [date, setDate] = useState(todayLocal());

  const { data, isLoading, error } = useQuery<DailyLoadListResult>({
    queryKey: ["crm-daily-load-list-report", date],
    queryFn: async () => {
      const res = await fetch(`/api/crm/reports/daily-load-list?date=${date}`);
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<DailyLoadListResult>;
    },
  });

  const crews = data?.crews ?? [];

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1200px] mx-auto print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daily Load List</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            What each crew needs to load — chemicals (concentrate + mixed volume) and materials — for a given day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      <h1 className="hidden print:block text-lg font-bold text-slate-900">
        Daily Load List — {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
      </h1>

      {data?.notes && data.notes.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 print:hidden">
          {data.notes.join(" · ")}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">Loading…</div>
      ) : error ? (
        <div className="flex items-center justify-center py-16 text-sm text-red-500">Failed to load report.</div>
      ) : crews.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
          No crews have chemical or material demand scheduled for this date.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-1">
          {crews.map((crew) => (
            <CrewCard key={crew.crewId ?? "unassigned"} crew={crew} />
          ))}
        </div>
      )}
    </div>
  );
}
