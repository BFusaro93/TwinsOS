"use client";

import { useMemo, useState } from "react";
import { Plus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { useAssets } from "@/lib/hooks/use-assets";
import { useJobAssets, useAddJobAsset, useRemoveJobAsset } from "@/lib/hooks/use-crew-board";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Equipment the crew needs to bring to a job. Rows live in crm_job_assets and
 * point at the shared CMMS assets registry; the Crew Board rolls them up per
 * crew so the shop knows what to load.
 */
export function JobAssetsSection({ jobId }: { jobId: string }) {
  const { data: jobAssets = [] } = useJobAssets(jobId);
  const { data: assets = [] } = useAssets();
  const addAsset = useAddJobAsset();
  const removeAsset = useRemoveJobAsset();
  const [picker, setPicker] = useState("");

  const available = useMemo(() => {
    const taken = new Set(jobAssets.map((a) => a.assetId));
    return assets.filter((a) => !taken.has(a.id) && a.status !== "disposed");
  }, [assets, jobAssets]);

  function handleAdd(assetId: string) {
    setPicker("");
    addAsset.mutate({ jobId, assetId }, { onError: () => toast.error("Couldn't add equipment") });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
        <Truck className="h-3.5 w-3.5" />
        Equipment to bring
      </div>

      {jobAssets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No equipment listed for this job.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {jobAssets.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs"
            >
              <span className="font-medium">{a.assetName}</span>
              {a.assetTag && <span className="text-muted-foreground">#{a.assetTag}</span>}
              <button
                type="button"
                aria-label={`Remove ${a.assetName}`}
                className="text-muted-foreground hover:text-red-600"
                onClick={() =>
                  removeAsset.mutate({ id: a.id }, { onError: () => toast.error("Couldn't remove equipment") })
                }
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Select value={picker} onValueChange={handleAdd}>
        <SelectTrigger className="h-8 w-64 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          <SelectValue placeholder="Add equipment…" />
        </SelectTrigger>
        <SelectContent>
          {available.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No more assets to add</div>
          ) : (
            available.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.name}
                {a.assetTag ? ` (#${a.assetTag})` : ""}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
