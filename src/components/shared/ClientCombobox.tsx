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
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ClientLike {
  id: string;
  displayName: string;
  billingAddress?: string | null;
}

interface ClientComboboxProps {
  clients: ClientLike[];
  value: string; // client id, or "" for none selected
  onValueChange: (value: string) => void;
  noneLabel?: string;
  id?: string;
}

export function ClientCombobox({
  clients,
  value,
  onValueChange,
  noneLabel = "Select client...",
  id,
}: ClientComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selectedClient = clients.find((c) => c.id === value);

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
          <span className={cn("truncate", !selectedClient && "text-muted-foreground")}>
            {selectedClient?.displayName ?? noneLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search clients..." />
          <CommandList className="!max-h-[220px]">
            <CommandEmpty>No clients found.</CommandEmpty>
            <CommandGroup>
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={[c.displayName, c.billingAddress ?? ""].join(" ")}
                  onSelect={() => {
                    onValueChange(c.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === c.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.displayName}</p>
                    {c.billingAddress && (
                      <p className="truncate text-xs text-slate-400">{c.billingAddress}</p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
