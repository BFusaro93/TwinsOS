"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Asset, Vehicle } from "@/types";

interface EntityComboboxProps {
  assets: Asset[];
  vehicles: Vehicle[];
  /** "asset:<id>" | "vehicle:<id>" | "none" */
  value: string;
  onValueChange: (value: string) => void;
  noneLabel?: string;
  /** When true, no "none" option is rendered */
  required?: boolean;
  id?: string;
}

export function EntityCombobox({
  assets,
  vehicles,
  value,
  onValueChange,
  noneLabel = "None",
  required = false,
  id,
}: EntityComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const activeAssets = assets.filter((a) => a.status !== "disposed");
  const activeVehicles = vehicles.filter((v) => v.status !== "disposed");

  // Resolve display label from the current value
  const displayLabel = React.useMemo(() => {
    if (!value || value === "none") return noneLabel;
    if (value.startsWith("asset:")) {
      const id = value.slice("asset:".length);
      return assets.find((a) => a.id === id)?.name ?? noneLabel;
    }
    if (value.startsWith("vehicle:")) {
      const id = value.slice("vehicle:".length);
      return vehicles.find((v) => v.id === id)?.name ?? noneLabel;
    }
    return noneLabel;
  }, [value, assets, vehicles, noneLabel]);

  const isSelected = value && value !== "none";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !isSelected && "text-muted-foreground")}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
        <Command
          filter={(itemValue, search) => {
            // itemValue is the searchable string we pass — name + make + model + tag
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search assets and vehicles..." />
          <CommandList className="!max-h-[220px]">
            <CommandEmpty>No results found.</CommandEmpty>

            {!required && (
              <CommandGroup>
                <CommandItem
                  value={`none ${noneLabel}`}
                  onSelect={() => { onValueChange("none"); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === "none" ? "opacity-100" : "opacity-0")} />
                  {noneLabel}
                </CommandItem>
              </CommandGroup>
            )}

            {activeAssets.length > 0 && (
              <>
                {!required && <CommandSeparator />}
                <CommandGroup heading="Assets">
                  {activeAssets.map((a) => {
                    const key = `asset:${a.id}`;
                    const searchStr = [a.name, a.make, a.model, a.assetTag, "asset"].filter(Boolean).join(" ");
                    return (
                      <CommandItem
                        key={key}
                        value={searchStr}
                        onSelect={() => { onValueChange(key); setOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", value === key ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{a.name}</p>
                          {(a.make || a.model || a.assetTag) && (
                            <p className="truncate text-xs text-slate-400">
                              {[a.make, a.model, a.assetTag].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}

            {activeVehicles.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Vehicles">
                  {activeVehicles.map((v) => {
                    const key = `vehicle:${v.id}`;
                    const searchStr = [v.name, v.make, v.model, String(v.year ?? ""), v.licensePlate, "vehicle"].filter(Boolean).join(" ");
                    return (
                      <CommandItem
                        key={key}
                        value={searchStr}
                        onSelect={() => { onValueChange(key); setOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", value === key ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{v.name}</p>
                          {(v.year || v.make || v.model) && (
                            <p className="truncate text-xs text-slate-400">
                              {[v.year, v.make, v.model, v.licensePlate].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
