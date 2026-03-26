"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MeterDetailPanel } from "@/components/cmms/MeterDetailPanel";
import { NewMeterDialog } from "@/components/cmms/NewMeterDialog";
import { useMeters } from "@/lib/hooks/use-meters";
import { useCMMSStore } from "@/stores/cmms-store";
import { relativeTime, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function MetersPage() {
  const [newMeterOpen, setNewMeterOpen] = useState(false);
  const { data: meters, isLoading } = useMeters();
  const { selectedMeterId, setSelectedMeterId } = useCMMSStore();

  const selectedMeter = (meters ?? []).find((m) => m.id === selectedMeterId) ?? null;

  return (
    <div className="flex h-full gap-0">
      {/* Left: table */}
      <div
        className={cn(
          "flex flex-col transition-all duration-200",
          selectedMeter ? "w-[420px] shrink-0" : "w-full"
        )}
      >
        <div className="flex flex-col gap-4 p-6">
          <PageHeader
            title="Meters"
            description="Equipment hour and mileage readings"
            action={
              <Button size="sm" onClick={() => setNewMeterOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                New Meter
              </Button>
            }
          />

          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead>Asset / Vehicle</TableHead>
                  <TableHead>Meter</TableHead>
                  <TableHead className="text-right">Current Reading</TableHead>
                  {!selectedMeter && <TableHead>Last Updated</TableHead>}
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: selectedMeter ? 4 : 5 }).map((__, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && (meters ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={selectedMeter ? 4 : 5} className="py-12 text-center">
                      <p className="text-sm text-slate-400">No meters found</p>
                    </TableCell>
                  </TableRow>
                )}

                {!isLoading &&
                  (meters ?? []).map((meter) => (
                    <TableRow
                      key={meter.id}
                      className={cn(
                        "cursor-pointer",
                        selectedMeterId === meter.id
                          ? "bg-brand-50 hover:bg-brand-50"
                          : "hover:bg-slate-50"
                      )}
                      onClick={() =>
                        setSelectedMeterId(
                          selectedMeterId === meter.id ? null : meter.id
                        )
                      }
                    >
                      <TableCell className="font-medium">{meter.assetName}</TableCell>
                      <TableCell className="text-slate-600">{meter.name}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-slate-900">
                        {meter.currentValue.toLocaleString()}{" "}
                        <span className="font-normal text-slate-400">{meter.unit}</span>
                      </TableCell>
                      {!selectedMeter && (
                        <TableCell className="text-slate-500">
                          <span title={formatDate(meter.lastReadingAt)}>
                            {relativeTime(meter.lastReadingAt)}
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        {meter.source === "samsara" ? (
                          <Badge
                            variant="outline"
                            className="border-brand-200 bg-brand-50 text-brand-700"
                          >
                            Samsara
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-100 text-slate-500"
                          >
                            Manual
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Right: detail panel */}
      {selectedMeter && (
        <div className="flex flex-1 flex-col border-l bg-white">
          <MeterDetailPanel meter={selectedMeter} />
        </div>
      )}

      <NewMeterDialog open={newMeterOpen} onOpenChange={setNewMeterOpen} />
    </div>
  );
}
