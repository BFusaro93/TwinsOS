"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, FlaskConical } from "lucide-react";
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

  const chemicalVisits = useMemo(() => {
    const chemicalServiceIds = new Set(allServices.filter((s) => s.trackChemicals).map((s) => s.id));
    return visits.filter((v) =>
      (v.job?.services ?? []).some((s) => s.serviceId && chemicalServiceIds.has(s.serviceId))
    );
  }, [visits, allServices]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, date]);

  const current = chemicalVisits[index];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-teal-600" />
            Chemical Tracking — {date}
          </DialogTitle>
        </DialogHeader>

        {chemicalVisits.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No chemical-tracking jobs scheduled for this date.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {current.clientName ?? "Unknown client"}
                </p>
                <p className="text-xs text-slate-500">
                  {(current.job?.serviceAddress ?? "") +
                    (current.job?.serviceCity ? `, ${current.job.serviceCity}` : "")}
                  {current.serviceNames && current.serviceNames.length > 0
                    ? ` · ${current.serviceNames.join(", ")}`
                    : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-500">
                {index + 1} of {chemicalVisits.length}
              </span>
            </div>

            <ChemicalApplicationPanel
              jobId={current.jobId}
              visitId={current.id}
              propertyId={current.job?.propertyId}
            />

            <div className="flex items-center justify-between border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Save &amp; Close
              </Button>
              <Button
                size="sm"
                onClick={() => setIndex((i) => Math.min(chemicalVisits.length - 1, i + 1))}
                disabled={index === chemicalVisits.length - 1}
              >
                Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
