import type { CRMJobVisit, SnowRoute } from "@/types/crm-jobs";

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

/** One choice in the crew picker when "Permanent" is on: a crew and the Master Route to save its stops to. */
export interface PermanentAssignTarget {
  /** `crewId|routeId` (routeId empty when the crew has no route yet), see parseAssignTarget. */
  value: string;
  label: string;
  crewId: string;
  routeId: string | null;
}

/**
 * A crew can have several Master Routes (e.g. one for plowing and one for salting, since some
 * storms only salt), so a permanent assignment has to name the route. One entry per route; a crew
 * with several routes shows "Crew - Route", a crew with one shows just its name, and a crew with
 * none is a single entry that creates its route. A shared route (no default crew, e.g. "All Plow
 * Jobs") is offered for every crew: the stop remembers which crew runs it.
 */
export function buildPermanentAssignTargets(crews: { id: string; name: string }[], routes: SnowRoute[]): PermanentAssignTarget[] {
  const out: PermanentAssignTarget[] = [];
  const shared = routes
    .filter((r) => r.isActive && !r.defaultCrewId)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const crew of crews) {
    const own = routes
      .filter((r) => r.isActive && r.defaultCrewId === crew.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (own.length === 0 && shared.length === 0) {
      out.push({ value: `${crew.id}|`, label: crew.name, crewId: crew.id, routeId: null });
      continue;
    }
    for (const r of own) {
      out.push({
        value: `${crew.id}|${r.id}`,
        label: own.length === 1 && shared.length === 0 ? crew.name : `${crew.name} - ${r.name}`,
        crewId: crew.id,
        routeId: r.id,
      });
    }
    for (const r of shared) {
      out.push({ value: `${crew.id}|${r.id}`, label: `${crew.name} - ${r.name}`, crewId: crew.id, routeId: r.id });
    }
  }
  return out;
}

/** Reads a crew picker value: "none" is Unassigned, otherwise `crewId` or `crewId|routeId`. */
export function parseAssignTarget(value: string): { crewId: string | null; routeId: string | null } {
  if (value === "none" || !value) return { crewId: null, routeId: null };
  const [crewId, routeId] = value.split("|");
  return { crewId: crewId || null, routeId: routeId || null };
}
