"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useRunVisualQuery } from "@/lib/hooks/use-report-center";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import type { DashboardPanel, VisualSpec } from "@/types/crm-reports";
import { computePresetRange } from "./ReportFilterBar";
import { VisualRenderer } from "./VisualRenderer";

const RANGE_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30", label: "Last 30 days" },
  { value: "last_90", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
] as const;

/** Width a panel of each size takes on a typical dashboard, so the preview shows the proportions
 *  (label crowding, bar count) the graphic will really have. The real width follows the screen. */
const SIZE_WIDTH_PX: Record<DashboardPanel["size"], number | null> = {
  third: 360,
  half: 540,
  full: null,
};

/** A graphic drawn the way it will look on a dashboard: same card, same renderer, live data.
 *  It only runs the query while it is on screen, so nothing loads until someone opens a preview. */
export function GraphicPreview({
  name,
  visual,
  size = "half",
}: {
  name: string;
  visual: VisualSpec;
  size?: DashboardPanel["size"];
}) {
  const orgTimeZone = useOrgTimeZone();
  const [preset, setPreset] = useState<string>("this_month");
  // Only graphics that follow the dashboard's date range have anything to pick here.
  const usesRange = !!visual.useTabDateRange;
  const range = usesRange ? computePresetRange(preset, orgTimeZone) : undefined;
  const { data, isLoading, error } = useRunVisualQuery(
    visual,
    range ? { from: range.from, to: range.to } : undefined
  );
  const width = SIZE_WIDTH_PX[size];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {data && !isLoading
            ? `Live data · ${data.rows.length} ${data.rows.length === 1 ? "row" : "rows"}${data.rows.length > 40 ? " — a lot for a chart, check it stays readable" : ""}`
            : "Live data"}
        </p>
        {usesRange && (
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg bg-muted/40 p-3">
        <Card className="flex flex-col" style={width ? { width, maxWidth: "100%" } : undefined}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{name}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : data ? (
              <VisualRenderer result={data} visual={visual} />
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
