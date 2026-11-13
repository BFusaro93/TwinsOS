import type { CRMJobVisit } from "@/types/crm-jobs";

/** Stops whose dispatch can be undone: dispatched and not yet started by the crew. */
export function splitCancelDispatchTargets(visits: CRMJobVisit[]): { cancellable: CRMJobVisit[]; started: CRMJobVisit[]; notDispatched: CRMJobVisit[] } {
  const cancellable: CRMJobVisit[] = [];
  const started: CRMJobVisit[] = [];
  const notDispatched: CRMJobVisit[] = [];
  for (const v of visits) {
    if (v.status === "dispatched") {
      // A clock stamp means the crew has started it (same test as isVisitInProgress).
      if (v.clockedInAt) started.push(v);
      else cancellable.push(v);
    } else if (v.status === "in_progress") started.push(v);
    else notDispatched.push(v);
  }
  return { cancellable, started, notDispatched };
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Quote anything with a delimiter / quote / newline; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface SnowExportRow {
  visit: CRMJobVisit;
  service: string;
  crew: string;
  amountCents: number | null;
}

/** CSV of the stops currently shown on the snow board. */
export function buildSnowStopsCsv(rows: SnowExportRow[]): string {
  const header = ["Date", "Client", "Service", "Address", "City", "State", "Zip", "Priority", "Crew", "Status", "Push", "Depth (in)", "Temp", "Notes to Crew", "Amount"];
  const lines = rows.map(({ visit: v, service, crew, amountCents }) => [
    v.scheduledDate,
    v.clientName,
    service,
    v.job?.serviceAddress,
    v.job?.serviceCity,
    v.job?.serviceState,
    v.job?.serviceZip,
    v.clientPriority,
    crew,
    v.status,
    v.pushNumber ?? 1,
    v.snowDepthInches,
    v.temperature,
    (v.notesToCrew ?? v.job?.notesToCrew ?? "").replace(/\s+/g, " "),
    amountCents != null ? (amountCents / 100).toFixed(2) : "",
  ].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
