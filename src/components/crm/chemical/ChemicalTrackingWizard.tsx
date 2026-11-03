"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronLeft, ChevronRight, CloudSun, FlaskConical, Mail, Printer } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useChemicalNoticeStatus } from "@/lib/hooks/use-chemical-wizard";
import { ApplyConditionsToVisitsDialog } from "./ApplyConditionsToVisitsDialog";
import { BulkSendChemicalNoticesDialog } from "./BulkSendChemicalNoticesDialog";
import { printChemicalRouteSheets } from "@/lib/chemical/route-sheet";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { ChemicalApplicationPanel } from "./ChemicalApplicationPanel";
import type { CRMJobVisit } from "@/types/crm-jobs";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  visits: CRMJobVisit[];
}

/** Office close-out flow for a scheduled day's chemical jobs — step through
 *  each chemical visit, verify what was used, and log conditions once per
 *  job (mirrors Service Autopilot's Dispatch Board "Chemical Tracking" wizard). */
export function ChemicalTrackingWizard({ open, onOpenChange, date, visits }: Props) {
  const { data: allServices = [] } = useCRMServices();
  const [index, setIndex] = useState(0);
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  // Saves whatever the open visit's rows have had edited (null when none is mounted).
  const saverRef = useRef<(() => Promise<number>) | null>(null);
  const registerSaver = useCallback((fn: (() => Promise<number>) | null) => {
    saverRef.current = fn;
  }, []);
  const [saving, setSaving] = useState(false);
  const { can } = usePermissions();

  const chemicalVisits = useMemo(() => {
    const chemicalServiceIds = new Set(allServices.filter((s) => s.trackChemicals).map((s) => s.id));
    return visits.filter((v) =>
      (v.job?.services ?? []).some((s) => s.serviceId && chemicalServiceIds.has(s.serviceId))
    );
  }, [visits, allServices]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, date]);

  // Clamp defensively: chemicalVisits can shrink out from under an open wizard
  // (e.g. a background refetch after another user reassigns/skips a visit),
  // which would otherwise leave `index` pointing past the end of the array.
  const safeIndex = Math.min(index, Math.max(chemicalVisits.length - 1, 0));
  const current = chemicalVisits[safeIndex];
  const { data: noticeStatus } = useChemicalNoticeStatus(chemicalVisits.map((v) => v.id), open);
  const sentCount = chemicalVisits.filter((v) => noticeStatus?.has(v.id)).length;

  /** Saves the open visit's edited rows, then runs `after`. A failed save keeps you on the visit. */
  async function saveThen(after: () => void) {
    setSaving(true);
    try {
      const saved = await saverRef.current?.();
      if (saved) toast.success(`Saved ${saved} chemical${saved === 1 ? "" : "s"}`);
      after();
    } catch {
      // The row already showed its own error; stay here so nothing edited is lost.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Chemical Tracking — {date}
            {chemicalVisits.length > 0 && (
              <div className="ml-auto mr-6 flex items-center gap-2">
                {can("chem_add_edit_usage") && (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setConditionsOpen(true)}>
                    <CloudSun className="h-3.5 w-3.5" /> Conditions
                  </Button>
                )}
                {can("chem_send_application_notice") && (
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setBulkSendOpen(true)}>
                    <Mail className="h-3.5 w-3.5" /> Send notices{noticeStatus ? ` (${sentCount}/${chemicalVisits.length} sent)` : ""}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => printChemicalRouteSheets({ visitIds: chemicalVisits.map((v) => v.id), dateLabel: date })}
                >
                  <Printer className="h-3.5 w-3.5" /> Print route sheets
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        {chemicalVisits.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-neutral-500">
            No chemical-tracking jobs scheduled for this date.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md border bg-slate-50 dark:bg-muted/40 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-neutral-100">
                  {current.clientName ?? "Unknown client"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(current.job?.serviceAddress ?? "") +
                    (current.job?.serviceCity ? `, ${current.job.serviceCity}` : "")}
                  {current.serviceNames && current.serviceNames.length > 0
                    ? ` · ${current.serviceNames.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {safeIndex + 1} of {chemicalVisits.length}
                </span>
                {noticeStatus && (
                  noticeStatus.has(current.id) ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400">
                      <CheckCircle2 className="h-3 w-3" /> Notice sent {new Date(noticeStatus.get(current.id)!).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Notice not sent</span>
                  )
                )}
              </div>
            </div>

            <ChemicalApplicationPanel
              jobId={current.jobId}
              visitId={current.id}
              propertyId={current.job?.propertyId}
              registerSaver={registerSaver}
            />

            <div className="flex items-center justify-between border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void saveThen(() => setIndex((i) => Math.max(0, i - 1)))}
                disabled={saving || safeIndex === 0}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => void saveThen(() => onOpenChange(false))} disabled={saving}>
                Save &amp; Close
              </Button>
              <Button
                size="sm"
                onClick={() => void saveThen(() => setIndex((i) => Math.min(chemicalVisits.length - 1, i + 1)))}
                disabled={saving || safeIndex === chemicalVisits.length - 1}
              >
                Save &amp; Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
      <ApplyConditionsToVisitsDialog
        open={conditionsOpen}
        onClose={() => setConditionsOpen(false)}
        visitIds={chemicalVisits.map((v) => v.id)}
        weatherJobId={chemicalVisits[0]?.jobId}
        dateLabel={date}
      />
      <BulkSendChemicalNoticesDialog
        open={bulkSendOpen}
        onClose={() => setBulkSendOpen(false)}
        visits={chemicalVisits.map((v) => ({ id: v.id, clientName: v.clientName }))}
        dateLabel={date}
      />
    </Dialog>
  );
}
