"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

interface MultiEntityComboboxProps {
  assets: Asset[];
  vehicles: Vehicle[];
  /** Array of "asset:<id>" | "vehicle:<id>" */
  values: string[];
  onValuesChange: (values: string[]) => void;
  id?: string;
}

export function MultiEntityCombobox({
  assets,
  vehicles,
  values,
  onValuesChange,
  id,
}: MultiEntityComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const activeAssets = assets.filter((a) => a.status !== "disposed");
  const activeVehicles = vehicles.filter((v) => v.status !== "disposed");

  function toggle(key: string) {
    onValuesChange(
      values.includes(key) ? values.filter((v) => v !== key) : [...values, key]
    );
  }

  function remove(key: string, e: React.MouseEvent) {
    e.stopPropagation();
    onValuesChange(values.filter((v) => v !== key));
  }

  function getLabel(key: string): string {
    if (key.startsWith("asset:")) {
      const id = key.slice("asset:".length);
      return assets.find((a) => a.id === id)?.name ?? key;
    }
    if (key.startsWith("vehicle:")) {
      const id = key.slice("vehicle:".length);
      return vehicles.find((v) => v.id === id)?.name ?? key;
    }
    return key;
  }

  const triggerLabel =
    values.length === 0
      ? "None"
      : values.length === 1
      ? getLabel(values[0])
      : `${values.length} assets / vehicles selected`;

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between font-normal",
              values.length === 0 && "text-muted-foreground"
            )}
          >
            <span className="truncate">{triggerLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(itemValue, search) =>
              itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }
          >
            <CommandInput placeholder="Search assets and vehicles..." />
            <CommandList className="max-h-64">
              <CommandEmpty>No results found.</CommandEmpty>

              {activeAssets.length > 0 && (
                <CommandGroup heading="Assets">
                  {activeAssets.map((a) => {
                    const key = `asset:${a.id}`;
                    const isSelected = values.includes(key);
                    const searchStr = [a.name, a.make, a.model, a.assetTag, "asset"]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <CommandItem
                        key={key}
                        value={searchStr}
                        // Keep popover open on select — multi-select behaviour
                        onSelect={() => toggle(key)}
                      >
                        {/* Visible square checkbox */}
                        <div
                          className={cn(
                            "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isSelected
                              ? "border-brand-500 bg-brand-500"
                              : "border-slate-300 bg-white"
                          )}
                        >
                          {isSelected && (
                            <Check className="h-3 w-3 text-white" strokeWidth={3} />
                          )}
                        </div>
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
              )}

              {activeVehicles.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Vehicles">
                    {activeVehicles.map((v) => {
                      const key = `vehicle:${v.id}`;
                      const isSelected = values.includes(key);
                      const searchStr = [
                        v.name, v.make, v.model, String(v.year ?? ""), v.licensePlate, "vehicle",
                      ]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <CommandItem
                          key={key}
                          value={searchStr}
                          onSelect={() => toggle(key)}
                        >
                          <div
                            className={cn(
                              "mr-2 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                              isSelected
                                ? "border-brand-500 bg-brand-500"
                                : "border-slate-300 bg-white"
                            )}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-white" strokeWidth={3} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{v.name}</p>
                            {(v.year || v.make || v.model) && (
                              <p className="truncate text-xs text-slate-400">
                                {[v.year, v.make, v.model, v.licensePlate]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}

              {/* Footer actions */}
              {values.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      onSelect={() => onValuesChange([])}
                      className="justify-center text-xs text-slate-500"
                    >
                      Clear all selections
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected entity chips — only shown when 2+ selected */}
      {values.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((key) => (
            <Badge
              key={key}
              variant="secondary"
              className="gap-1 pl-2 pr-1 text-xs font-normal"
            >
              <span className="max-w-[160px] truncate">{getLabel(key)}</span>
              <button
                type="button"
                onClick={(e) => remove(key, e)}
                className="ml-0.5 rounded text-slate-400 hover:text-slate-700"
                aria-label={`Remove ${getLabel(key)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
