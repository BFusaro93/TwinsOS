"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Users, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddVisitCrew, useRemoveVisitCrew } from "@/lib/hooks/use-crm-jobs";
import type { CRMJobVisit } from "@/types/crm-jobs";

/** The crew a visit actually belongs to — its own, else the job's (see crew-id.ts). */
function effectiveCrewName(v: CRMJobVisit): string | null {
  if (v.crewUnassigned) return null;
  return v.crewName ?? v.job?.crewName ?? null;
}

const STARTABLE = new Set(["scheduled", "dispatched"]);

/**
 * "Crews on this stop" — multi-crew stops. One visit per crew, all sharing a
 * crew group (see supabase/migrations/20261029000000_multi_crew_visits.sql):
 * every crew is its own column on the board, its own stop in the crew app and
 * clocks its own hours; the lead visit bills the stop once.
 *
 * `groupVisits` must contain every visit the caller has loaded for this stop's
 * day — siblings are found by crewGroupId.
 */
export function VisitCrewsSection({
  visit,
  groupVisits,
  crews,
}: {
  visit: CRMJobVisit;
  groupVisits: CRMJobVisit[];
  crews: { id: string; name: string }[];
}) {
  const addCrew = useAddVisitCrew();
  const removeCrew = useRemoveVisitCrew();
  const [pick, setPick] = useState("");

  const members = visit.crewGroupId
    ? groupVisits.filter((v) => v.crewGroupId === visit.crewGroupId && v.status !== "cancelled")
    : [visit];
  const onStop = new Set(members.map((v) => v.crewId ?? v.job?.crewId ?? null).filter((id): id is string => !!id));
  const available = crews.filter((c) => !onStop.has(c.id));

  const hasCrew = !!effectiveCrewName(visit);
  const canAdd = STARTABLE.has(visit.status) && !visit.clockedInAt && visit.job?.jobType !== "snow" && !visit.stormEventId;
  const isGroup = members.length > 1;

  async function handleAdd(crewId: string) {
    setPick("");
    try {
      await addCrew.mutateAsync({ visitId: visit.id, crewId });
      toast.success("Crew added to this stop");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add crew");
    }
  }

  async function handleRemove(v: CRMJobVisit) {
    try {
      await removeCrew.mutateAsync(v.id);
      toast.success("Crew removed from this stop");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove crew");
    }
  }

  // Nothing to show on a single-crew visit that can't take a second crew.
  if (!isGroup && !canAdd) return null;

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
        <Users className="h-3 w-3" />
        Crews on this stop
      </label>

      {isGroup && (
        <ul className="mb-2 space-y-1">
          {members.map((v) => {
            const removable = STARTABLE.has(v.status) && !v.clockedInAt;
            return (
              <li key={v.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{effectiveCrewName(v) ?? "Unassigned"}</span>
                  {!v.crewGroupSecondary && <span className="ml-1 text-muted-foreground">(lead — bills the stop)</span>}
                  {v.id === visit.id && <span className="ml-1 text-muted-foreground">· this visit</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <span className="capitalize">{v.status.replace("_", " ")}</span>
                  {removable && (
                    <button
                      type="button"
                      aria-label={`Remove ${effectiveCrewName(v) ?? "crew"} from this stop`}
                      className="rounded p-0.5 hover:bg-muted hover:text-foreground disabled:opacity-50"
                      disabled={removeCrew.isPending}
                      onClick={() => handleRemove(v)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {canAdd && (
        hasCrew ? (
          <Select value={pick || "none"} onValueChange={(v) => v !== "none" && handleAdd(v)} disabled={addCrew.isPending || available.length === 0}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder={available.length === 0 ? "No other crews" : "Add another crew…"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs" disabled>Add another crew…</SelectItem>
              {available.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-[11px] text-muted-foreground">Assign a crew first, then add a second one.</p>
        )
      )}

      {isGroup && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Each crew clocks its own hours. Revenue, the invoice and the visit count belong to the lead.
        </p>
      )}
    </div>
  );
}
