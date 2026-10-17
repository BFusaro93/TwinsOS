"use client";

import { useMemo, useState } from "react";
import { Plus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { EquipmentAvatar } from "@/components/crm/dispatch/EquipmentAvatar";
import {
  equipKey,
  useAddJobAsset,
  useEquipment,
  useJobAssets,
  useRemoveJobAsset,
} from "@/lib/hooks/use-crew-board";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const GROUPS = [
  { rank: 0, label: "Trucks & vehicles" },
  { rank: 1, label: "Trailers" },
  { rank: 2, label: "Equipment" },
] as const;

/**
 * Equipment the crew needs to bring to a job — trucks, trailers and other
 * assets from the shared CMMS registries. Rows live in crm_job_assets; the Crew
 * Board rolls them up per crew so the shop knows what to load.
 */
export function JobAssetsSection({ jobId }: { jobId: string }) {
  const { data: jobAssets = [] } = useJobAssets(jobId);
  const equipment = useEquipment();
  const addAsset = useAddJobAsset();
  const removeAsset = useRemoveJobAsset();
  const [picker, setPicker] = useState("");
  const itemByKey = useMemo(() => new Map(equipment.map((e) => [e.key, e])), [equipment]);

  const available = useMemo(() => {
    const taken = new Set(jobAssets.map((a) => a.key));
    return equipment.filter((e) => !taken.has(e.key) && e.status !== "disposed");
  }, [equipment, jobAssets]);

  function handleAdd(key: string) {
    setPicker("");
    const item = itemByKey.get(key);
    if (!item) return;
    addAsset.mutate({ jobId, ref: { kind: item.kind, id: item.id } }, { onError: () => toast.error("Couldn't add equipment") });
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
          {jobAssets.map((a) => {
            const item = itemByKey.get(a.key);
            return (
              <li key={a.id} className="flex items-center gap-1.5 rounded-full border bg-muted py-0.5 pl-0.5 pr-2.5 text-xs">
                <EquipmentAvatar
                  item={item ?? { photoUrl: null, isVehicle: a.ref.kind === "vehicle", name: a.name }}
                  className="h-6 w-6"
                />
                <span className="font-medium">{a.name}</span>
                {a.tag && <span className="text-muted-foreground">#{a.tag}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  className="text-muted-foreground hover:text-red-600"
                  onClick={() => removeAsset.mutate({ id: a.id }, { onError: () => toast.error("Couldn't remove equipment") })}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Select value={picker} onValueChange={handleAdd}>
        <SelectTrigger className="h-8 w-72 text-xs">
          <Plus className="mr-1 h-3.5 w-3.5" />
          <SelectValue placeholder="Add equipment…" />
        </SelectTrigger>
        <SelectContent>
          {available.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No more equipment to add</div>
          ) : (
            GROUPS.map((g) => {
              const items = available.filter((e) => e.rank === g.rank);
              if (items.length === 0) return null;
              return (
                <SelectGroup key={g.rank}>
                  <SelectLabel className="text-[10px] uppercase">{g.label}</SelectLabel>
                  {items.map((e) => (
                    <SelectItem key={e.key} value={equipKey({ kind: e.kind, id: e.id })} className="text-xs">
                      {e.name}
                      {e.tag ? ` (#${e.tag})` : ""}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
