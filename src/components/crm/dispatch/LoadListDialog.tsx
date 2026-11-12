"use client";

import Link from "next/link";
import { ExternalLink, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useQuery } from "@/lib/hooks/use-query";
import type { DailyLoadListResult } from "@/lib/reports/materials/daily-load-list";
import { DailyLoadListView, fetchDailyLoadList } from "@/components/crm/reports/DailyLoadListView";

/**
 * The Daily Load List for the day the dispatch board is showing: what each crew loads
 * (chemical concentrate + mixed volume, materials) before rolling out. Same data and
 * as Reports → Daily Load List. Shown to anyone who can open the board — the API accepts
 * either dispatch-board or Report Center permission.
 */
export function LoadListDialog({ open, onOpenChange, date }: { open: boolean; onOpenChange: (o: boolean) => void; date: string }) {
  const { data, isLoading, error } = useQuery<DailyLoadListResult>({
    queryKey: ["crm-daily-load-list-report", date],
    queryFn: () => fetchDailyLoadList(date),
    enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
  const reportHref = `/crm/reports/daily-load-list?date=${encodeURIComponent(date)}`;
  const dayLabel = /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Load List — {dayLabel}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-muted-foreground">
          What each crew needs on the truck for this day: chemicals (concentrate and mixed volume) and materials.
        </p>
        <div className="flex flex-col gap-4">
          <DailyLoadListView data={data} isLoading={isLoading} error={error} columns={2} />
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={reportHref} target="_blank" rel="noopener noreferrer">
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={reportHref}>
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open full report
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
