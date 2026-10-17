"use client";

import { useMemo, useState } from "react";
import { Plus, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { EquipmentAvatar } from "@/components/crm/dispatch/EquipmentAvatar";
import {
  useAddJobAsset,
  useEquipment,
  useJobAssets,
  useRemoveJobAsset,
} from "@/lib/hooks/use-crew-board";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const [open, setOpen] = useState(false);
  const itemByKey = useMemo(() => new Map(equipment.map((e) => [e.key, e])), [equipment]);

  const available = useMemo(() => {
    const taken = new Set(jobAssets.map((a) => a.key));
    return equipment.filter((e) => !taken.has(e.key) && e.status !== "disposed");
  }, [equipment, jobAssets]);

  function handleAdd(key: string) {
    // Popover stays open so several items can be added in a row.
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

      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 w-72 justify-start gap-1 text-xs font-normal text-muted-foreground">
            <Plus className="h-3.5 w-3.5" />
            Add equipment…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="z-[9999] w-80 p-0" align="start">
          <Command filter={(value, search) => (value.includes(search.trim().toLowerCase()) ? 1 : 0)}>
            <CommandInput placeholder="Search trucks, trailers, equipment…" />
            <CommandList className="max-h-72">
              <CommandEmpty>No equipment found.</CommandEmpty>
              {GROUPS.map((g) => {
                const items = available.filter((e) => e.rank === g.rank);
                if (items.length === 0) return null;
                return (
                  <CommandGroup key={g.rank} heading={g.label}>
                    {items.map((e) => (
                      <CommandItem key={e.key} value={`${e.search} ${e.key}`} onSelect={() => handleAdd(e.key)} className="gap-2 text-xs">
                        <EquipmentAvatar item={e} className="h-6 w-6" />
                        <span className="truncate font-medium">{e.name}</span>
                        {e.tag && <span className="shrink-0 text-muted-foreground">#{e.tag}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
