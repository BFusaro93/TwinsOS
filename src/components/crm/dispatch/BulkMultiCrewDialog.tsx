"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddVisitCrew } from "@/lib/hooks/use-crm-jobs";
import type { CRMJobVisit } from "@/types/crm-jobs";

/**
 * Re-assign the selected visits to several crews at once. The first crew
 * ticked becomes the lead (the visit's own crew — it bills the stop); every
 * other crew is added as a sibling visit on the same stop, exactly like
 * "Crews on this stop" does one visit at a time (see VisitCrewsSection).
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
  // Click order matters: the first entry is the lead.
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const eligible = visits.filter((v) => v.status !== "completed" && v.status !== "cancelled");
  const crewName = (id: string) => crews.find((c) => c.id === id)?.name ?? "crew";

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function apply() {
    if (picked.length === 0 || eligible.length === 0) return;
    setBusy(true);
    const [lead, ...extras] = picked;
    let failed = 0;
    let firstError = "";
    try {
      // 1. Lead crew on every visit that isn't already on it.
      const needLead = eligible.filter((v) => resolveCrewId(v) !== lead).map((v) => v.id);
      if (needLead.length > 0) {
        const res = await fetch("/api/crm/visits/bulk-update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: needLead, updates: { crew_id: lead } }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: unknown };
          throw new Error(typeof err.error === "string" ? err.error : "Failed to assign the lead crew");
        }
      }
      // 2. Each extra crew as a sibling visit, skipping crews already on the stop.
      for (const v of eligible) {
        const onStop = new Set(
          (v.crewGroupId ? allVisits.filter((x) => x.crewGroupId === v.crewGroupId && x.status !== "cancelled") : [v])
            .map(resolveCrewId)
            .filter((id): id is string => !!id)
        );
        for (const crewId of extras) {
          if (onStop.has(crewId)) continue;
          try {
            await addCrew.mutateAsync({ visitId: v.id, crewId });
          } catch (err) {
            failed++;
            if (!firstError) firstError = err instanceof Error ? err.message : "Failed to add crew";
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
      const n = eligible.length;
      if (failed > 0) {
        toast.warning(`Some crews couldn't be added (${failed}): ${firstError}`);
      } else {
        toast.success(`${n} visit${n > 1 ? "s" : ""} assigned to ${picked.map(crewName).join(" + ")}`);
      }
      setPicked([]);
      onDone();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to reassign visits");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setPicked([]); } }}>
      <DialogContent className="max-w-sm p-5 gap-4">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Assign {eligible.length} Visit{eligible.length !== 1 ? "s" : ""} to Multiple Crews
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
          The first crew you tick is the lead. Each crew gets its own stop and clocks its own hours; the invoice stays with the lead.
          Completed, in-progress and snow visits can&apos;t take extra crews.
        </p>
        <DialogFooter>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" className="h-7 text-xs" disabled={busy || picked.length === 0} onClick={apply}>
            {busy ? "Assigning…" : picked.length > 1 ? `Assign ${picked.length} crews` : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
