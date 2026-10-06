"use client";

import { useState } from "react";
import { useMeters } from "@/lib/hooks/use-meters";
import { MeterDetailSheet } from "@/components/cmms/MeterDetailSheet";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Meter } from "@/types";

interface AssetMetersTabProps {
  assetId: string;
  recordLabel?: string;
}

export function AssetMetersTab({ assetId, recordLabel = "asset" }: AssetMetersTabProps) {
  const { data: allMeters, isLoading } = useMeters();
  const [selectedMeter, setSelectedMeter] = useState<Meter | null>(null);

  const meters = (allMeters ?? []).filter((m) => m.assetId === assetId);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (meters.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center">
        <p className="text-sm text-slate-400 dark:text-neutral-500">No meters found for this {recordLabel}.</p>
      </div>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-muted/40">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Meter</th>
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Current Reading</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Last Updated</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody>
              {meters.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <button
                      className="font-medium text-brand-600 dark:text-brand-400 hover:underline"
                      onClick={() => setSelectedMeter(m)}
                    >
                      {m.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="font-semibold text-slate-900 dark:text-neutral-100">
                      {m.currentValue.toLocaleString()}
                    </span>
                    <span className="ml-1 text-xs text-slate-400 dark:text-neutral-500">{m.unit}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{formatDate(m.lastReadingAt)}</td>
                  <td className="px-3 py-2">
                    {m.source === "samsara" ? (
                      <Badge variant="outline" className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400">
                        Samsara
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-border bg-slate-50 dark:bg-muted/40 text-slate-600 dark:text-neutral-400">
                        Manual
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MeterDetailSheet
        meter={selectedMeter}
        open={!!selectedMeter}
        onOpenChange={(open) => { if (!open) setSelectedMeter(null); }}
      />
    </>
  );
}
