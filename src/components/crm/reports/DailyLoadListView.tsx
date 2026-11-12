"use client";

import { Fragment } from "react";
import { AlertTriangle } from "lucide-react";
import type { DailyLoadListResult, DailyLoadListCrewGroup } from "@/lib/reports/materials/daily-load-list";

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}



export function LoadListCrewCard({ crew }: { crew: DailyLoadListCrewGroup }) {
  return (
    <div className="rounded-lg border bg-card shadow-sm overflow-hidden break-inside-avoid">
      <div
        className="px-4 py-2.5 border-b flex items-center gap-2"
        style={{ backgroundColor: crew.crewColor ? `${crew.crewColor}1a` : undefined }}
      >
        {crew.crewColor && (
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: crew.crewColor }} />
        )}
        <h2 className="text-sm font-bold text-slate-900 dark:text-neutral-100">{crew.crewName}</h2>
      </div>

      {crew.chemicals.length > 0 && (
        <div className="px-4 py-3 border-b">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-2">Chemicals to load</p>
          <table className="w-full text-xs">
            <tbody>
              {crew.chemicals.map((c) => (
                <Fragment key={c.productId}>
                <tr className="border-b border-slate-100 dark:border-neutral-800 last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-slate-800 dark:text-neutral-100 align-top">{c.productName}</td>
                  {/* A bare number with no unit is unusable (and unsafe) on a
                      load sheet — say what's wrong instead. */}
                  {c.concentrateQty != null && c.concentrateUnitName ? (
                    <>
                      <td className="py-1.5 pr-2 text-right tabular-nums whitespace-nowrap align-top">
                        {fmtQty(c.concentrateQty)} {c.concentrateUnitName}
                      </td>
                      <td className="py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground align-top">
                        {c.mixVolumeQty != null && c.mixVolumeUnitName
                          ? `≈ ${fmtQty(c.mixVolumeQty)} ${c.mixVolumeUnitName} mixed`
                          : ""}
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="py-1.5 text-right align-top">
                      <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Can&apos;t compute
                      </span>
                      <span className="block text-[10px] font-normal text-amber-700 dark:text-amber-400 mt-0.5 max-w-[15rem] ml-auto">
                        {c.unresolvedReason ?? "Check this product's application rate setup."}
                      </span>
                    </td>
                  )}
                </tr>
                {/* Per-stop breakdown: the truck total says what to load, this says
                    what to make up at each property. */}
                {c.visits.length > 0 && (
                  <tr className="border-b border-slate-100 dark:border-neutral-800 last:border-0">
                    <td colSpan={3} className="pb-2 pl-3">
                      <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                        {c.visits.map((v) => (
                          <li key={v.visitId ?? v.jobId} className="flex justify-between gap-3">
                            <span>
                              {v.clientName}
                              {v.address ? ` · ${v.address}` : ""}
                            </span>
                            <span className="tabular-nums whitespace-nowrap">
                              {v.qty != null && v.unitName ? `${fmtQty(v.qty)} ${v.unitName}` : "—"}
                              {v.mixQty != null && v.mixUnitName ? ` · ${fmtQty(v.mixQty)} ${v.mixUnitName} mix` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {crew.materials.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-2">Materials to load</p>
          <table className="w-full text-xs">
            <tbody>
              {crew.materials.map((m) => (
                <tr key={m.productId} className="border-b border-slate-100 dark:border-neutral-800 last:border-0">
                  <td className="py-1.5 pr-2 font-medium text-slate-800 dark:text-neutral-100">
                    {m.productName}
                    {m.sharedWithCrews.length > 0 && (
                      <span className="block text-[10px] font-normal text-amber-700 dark:text-amber-400">
                        Job is also on {m.sharedWithCrews.join(", ")} — confirm who loads it
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums whitespace-nowrap align-top">{fmtQty(m.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-2 bg-slate-50/60 dark:bg-muted/40 border-t">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500 mb-1">Stops</p>
        <p className="text-xs text-muted-foreground">
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


/** Crew cards for one day's load list — shared by the report page and the dispatch board dialog. */
export function DailyLoadListView({
  data,
  isLoading,
  error,
  columns = 2,
}: {
  data: DailyLoadListResult | undefined;
  isLoading: boolean;
  error: unknown;
  columns?: 1 | 2;
}) {
  const crews = data?.crews ?? [];
  return (
    <>
      {data?.notes && data.notes.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 print:hidden">
          {data.notes.join(" · ")}
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400 dark:text-neutral-500">Loading…</div>
      ) : error ? (
        <div className="flex items-center justify-center py-16 text-sm text-red-500 dark:text-red-400">Failed to load report.</div>
      ) : crews.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400 dark:text-neutral-500">
          No crews have chemical or material demand scheduled for this date.
        </div>
      ) : (
        <div className={columns === 2 ? "grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-1" : "grid grid-cols-1 gap-4"}>
          {crews.map((crew) => (
            <LoadListCrewCard key={crew.crewId ?? "unassigned"} crew={crew} />
          ))}
        </div>
      )}
    </>
  );
}

/** Fetches one day's load list (the API defaults to the org's today). */
export async function fetchDailyLoadList(date: string): Promise<DailyLoadListResult> {
  const res = await fetch(`/api/crm/reports/daily-load-list?date=${encodeURIComponent(date)}`);
  if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to the Report Center." : "Failed to load report");
  return res.json() as Promise<DailyLoadListResult>;
}

/** One crew's load as flat rows — "Black Mulch 14", "Fert 16-0-8 12 bags" — for the Crew Board's Load lane. */
export interface LoadLaneRow {
  key: string;
  name: string;
  /** Preformatted quantity, or null when it can't be totalled (then `warning` says why). */
  qty: string | null;
  warning: string | null;
  /** crm_crew_load_checks key — set for materials only (chemicals are preloaded in the crew app's chemical flow). */
  checkKey?: string;
}

export function loadLaneRows(crew: DailyLoadListCrewGroup | undefined): LoadLaneRow[] {
  if (!crew) return [];
  const chem: LoadLaneRow[] = crew.chemicals.map((c) => ({
    key: `c:${c.productId}`,
    name: c.productName,
    qty: c.concentrateQty != null && c.concentrateUnitName ? `${fmtQty(c.concentrateQty)} ${c.concentrateUnitName}` : null,
    warning: c.concentrateQty != null && c.concentrateUnitName ? null : (c.unresolvedReason ?? "Check this product's application rate setup."),
  }));
  const mats: LoadLaneRow[] = crew.materials.map((m) => ({
    key: `m:${m.productId}`,
    name: m.productName,
    qty: fmtQty(m.qty),
    warning: null,
    checkKey: `product:${m.productId}`,
  }));
  return [...chem, ...mats];
}
