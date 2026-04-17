"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Vendor } from "@/types";

interface VendorComboboxProps {
  vendors: Vendor[];
  value: string; // vendor id, or "none"
  onValueChange: (value: string) => void;
  noneLabel?: string; // label for the "no vendor" option, e.g. "No preference" or "Select vendor"
  required?: boolean; // if true, no "none" option
  id?: string;
  /** When provided, shows an "Add New Vendor" option at the bottom of the list. */
  onCreateNew?: () => void;
}

export function VendorCombobox({
  vendors,
  value,
  onValueChange,
  noneLabel = "No preference",
  required = false,
  id,
  onCreateNew,
}: VendorComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedVendor = vendors.find((v) => v.id === value);
  const displayLabel =
    value === "none" || !value ? noneLabel : (selectedVendor?.name ?? noneLabel);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedVendor && "text-muted-foreground")}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput placeholder="Search vendors..." />
          <CommandList className="!max-h-[220px]">
            <CommandEmpty>No vendors found.</CommandEmpty>
            <CommandGroup>
              {!required && (
                <CommandItem
                  value="none"
                  onSelect={() => {
                    onValueChange("none");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "none" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {noneLabel}
                </CommandItem>
              )}
              {vendors.map((v) => (
                <CommandItem
                  key={v.id}
                  value={v.name}
                  onSelect={() => {
                    onValueChange(v.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === v.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {v.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        {onCreateNew && (
          <div className="border-t p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-blue-600 hover:bg-slate-100"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                onCreateNew();
              }}
            >
              <Plus className="h-4 w-4" />
              Add New Vendor
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
