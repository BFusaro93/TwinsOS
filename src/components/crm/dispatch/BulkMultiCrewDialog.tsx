"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddVisitCrew, useRemoveVisitCrew } from "@/lib/hooks/use-crm-jobs";
import type { CRMJobVisit } from "@/types/crm-jobs";

const STARTABLE = new Set(["scheduled", "dispatched"]);

/**
 * Sets the selected stops to exactly the ticked crews. The first crew ticked is
 * the lead (the stop's original visit — it bills); the others are sibling
 * visits like "Crews on this stop" (see VisitCrewsSection). Crews not ticked
 * come off the stop (before they've started).
 */
export function BulkMultiCrewDialog({
  open,
  onOpenChange,
  visits,
  allVisits,
  crews,
  resolveCrewId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The selected visits (completed ones are skipped here). */
  visits: CRMJobVisit[];
  /** Everything loaded on the board — siblings are found by crewGroupId. */
  allVisits: CRMJobVisit[];
  crews: { id: string; name: string }[];
  resolveCrewId: (v: CRMJobVisit) => string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const addCrew = useAddVisitCrew();
  const removeCrew = useRemoveVisitCrew();
  const [busy, setBusy] = useState(false);

  const eligible = visits.filter((v) => v.status !== "completed" && v.status !== "cancelled");
  const crewName = (id: string) => crews.find((c) => c.id === id)?.name ?? "crew";

  // One entry per stop: a selected sibling stands for its whole crew group.
  const stops = (() => {
    const seen = new Set<string>();
    const out: { lead: CRMJobVisit | null; secondaries: CRMJobVisit[]; anchor: CRMJobVisit }[] = [];
    for (const v of eligible) {
      const key = v.crewGroupId ?? v.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const members = v.crewGroupId
        ? allVisits.filter((x) => x.crewGroupId === v.crewGroupId && x.status !== "cancelled")
        : [v];
      out.push({
        anchor: v,
        lead: members.find((m) => !m.crewGroupSecondary) ?? null,
        secondaries: members.filter((m) => m.crewGroupSecondary),
      });
    }
    return out;
  })();

  // Click order matters: the first entry is the lead. With a single stop
  // selected, start from the crews already on it (lead first).
  const [picked, setPicked] = useState<string[]>(() => {
    if (stops.length !== 1 || !stops[0].lead) return [];
    const ids = [stops[0].lead, ...stops[0].secondaries].map(resolveCrewId);
    return ids.filter((id): id is string => !!id);
  });

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  /** Makes one stop's crews exactly `picked`, lead = picked[0]. Returns a problem message or null. */
  async function applyToStop(stop: (typeof stops)[number]): Promise<string | null> {
    const lead = stop.lead;
    if (!lead) return "The stop's lead visit isn't loaded on this board view — clear the crew filter and retry.";
    if (!STARTABLE.has(lead.status) || lead.clockedInAt) return "A crew has already started this stop.";
    const target = new Set(picked);
    const newLead = picked[0];
    let problem: string | null = null;
    const onStop = new Set<string>();
    const leadCrew = resolveCrewId(lead);

    // 1. Drop secondaries that aren't wanted — and the one whose crew is about
    //    to become the lead (its crew moves onto the lead's visit instead).
    for (const s of stop.secondaries) {
      const c = resolveCrewId(s);
      const unwanted = !c || !target.has(c) || (c === newLead && leadCrew !== newLead);
      if (!unwanted) { onStop.add(c); continue; }
      if (!STARTABLE.has(s.status) || s.clockedInAt) {
        problem = `${c ? crewName(c) : "A crew"} has already started and can't be removed.`;
        if (c) onStop.add(c);
        continue;
      }
      await removeCrew.mutateAsync(s.id);
    }

    // 2. The lead visit takes the new lead crew.
    if (leadCrew !== newLead) {
      const res = await fetch("/api/crm/visits/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [lead.id], updates: { crew_id: newLead } }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: unknown };
        return typeof err.error === "string" ? err.error : "Failed to assign the lead crew";
      }
    }
    onStop.add(newLead);

    // 3. Every other picked crew that isn't on the stop yet.
    for (const crewId of picked.slice(1)) {
      if (onStop.has(crewId)) continue;
      await addCrew.mutateAsync({ visitId: lead.id, crewId });
      onStop.add(crewId);
    }
    return problem;
  }

  async function apply() {
    if (picked.length === 0 || stops.length === 0) return;
    setBusy(true);
    const problems: string[] = [];
    let done = 0;
    for (const stop of stops) {
      try {
        const problem = await applyToStop(stop);
        if (problem) problems.push(problem);
        else done++;
      } catch (err) {
        problems.push(err instanceof Error ? err.message : "Failed to update a stop");
      }
    }
    await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    qc.invalidateQueries({ queryKey: ["crm-jobs"] });
    setBusy(false);
    if (problems.length > 0) {
      toast.warning(`${done} of ${stops.length} stop${stops.length > 1 ? "s" : ""} updated. ${problems[0]}`);
    } else {
      toast.success(`${done} stop${done > 1 ? "s" : ""} set to ${picked.map(crewName).join(" + ")}`);
    }
    if (done > 0) onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setPicked([]); } }}>
      <DialogContent className="max-w-sm p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Set Crews for {stops.length} Stop{stops.length !== 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {crews.map((c) => {
            const idx = picked.indexOf(c.id);
            return (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted">
                <Checkbox checked={idx >= 0} onCheckedChange={() => toggle(c.id)} className="h-3.5 w-3.5" />
                <span className="flex-1">{c.name}</span>
                {idx === 0 && <span className="text-[10px] text-muted-foreground">lead — bills the stop</span>}
              </label>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          The ticked crews become the stop&apos;s full crew list; any other crew on it is removed. The first crew you tick is the lead. Each crew gets its own stop and clocks its own hours; the invoice (snow: the storm&apos;s charge) stays with the lead.
          Completed and in-progress visits can&apos;t take extra crews.
        </p>
        <DialogFooter>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" disabled={busy || picked.length === 0} onClick={apply}>
            {busy ? "Saving…" : picked.length > 1 ? `Set ${picked.length} crews` : "Set crew"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
