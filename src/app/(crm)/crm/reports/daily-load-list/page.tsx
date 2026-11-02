"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@/lib/hooks/use-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DailyLoadListResult } from "@/lib/reports/materials/daily-load-list";
import { DailyLoadListView, fetchDailyLoadList } from "@/components/crm/reports/DailyLoadListView";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";

// useSearchParams (?date= from the dispatch board's Load List) needs a Suspense boundary.
export default function DailyLoadListReportPage() {
  return (
    <Suspense>
      <DailyLoadListReport />
    </Suspense>
  );
}

/**
 * "Today" for this report is the ORG's operating day, not the reader's. The API route defaults
 * an omitted ?date= to the same org timezone, so both sides read the org's clock.
 */
function DailyLoadListReport() {
  const orgTimeZone = useOrgTimeZone();
  const dateParam = useSearchParams().get("date");
  const validParam = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;
  const [date, setDate] = useState(validParam ?? todayInZone(orgTimeZone));
  // The org settings query can resolve after this mounts, so the initial
  // value above may have been computed from the fallback zone. Re-snap to the
  // org's today once the real zone lands — but only while the picker is still
  // showing a default, never overriding a day the user chose.
  const touched = useRef(!!validParam);
  useEffect(() => {
    if (touched.current) return;
    setDate(todayInZone(orgTimeZone));
  }, [orgTimeZone]);

  const { data, isLoading, error } = useQuery<DailyLoadListResult>({
    queryKey: ["crm-daily-load-list-report", date],
    queryFn: () => fetchDailyLoadList(date),
  });

  return (
    <div className="flex flex-col gap-5 p-6 max-w-[1200px] mx-auto print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-neutral-100">Daily Load List</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            What each crew needs to load — chemicals (concentrate + mixed volume) and materials — for a given day.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={date} onChange={(e) => { touched.current = true; setDate(e.target.value); }} className="w-40" />
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      <h1 className="hidden print:block text-lg font-bold text-slate-900 dark:text-neutral-100">
        Daily Load List — {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
      </h1>

      <DailyLoadListView data={data} isLoading={isLoading} error={error} />
    </div>
  );
}
