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
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProductItem, Part } from "@/types";

interface CatalogItemComboboxProps {
  products: ProductItem[];
  parts: Part[];
  /** "product:<id>" | "part:<id>" | "" */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  /** "sm" renders a compact h-8 text-xs button for use inside table rows */
  size?: "default" | "sm";
  id?: string;
  /** When provided, shows an "Add New Product" option at the bottom of the Products section. */
  onCreateNewProduct?: () => void;
  /** When provided, shows an "Add New Part" option at the bottom of the Parts section. */
  onCreateNewPart?: () => void;
}

export function CatalogItemCombobox({
  products,
  parts,
  value,
  onValueChange,
  placeholder = "Select item",
  size = "default",
  id,
  onCreateNewProduct,
  onCreateNewPart,
}: CatalogItemComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const displayLabel = React.useMemo(() => {
    if (!value) return null;
    if (value.startsWith("product:")) {
      const pid = value.slice("product:".length);
      return products.find((p) => p.id === pid)?.name ?? null;
    }
    if (value.startsWith("part:")) {
      const pid = value.slice("part:".length);
      return parts.find((p) => p.id === pid)?.name ?? null;
    }
    return null;
  }, [value, products, parts]);

  const isSmall = size === "sm";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            isSmall && "h-8 text-xs"
          )}
        >
          <span className={cn("truncate", !displayLabel && "text-muted-foreground")}>
            {displayLabel ?? placeholder}
          </span>
          <ChevronsUpDown className={cn("ml-2 shrink-0 opacity-50", isSmall ? "h-3 w-3" : "h-4 w-4")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0"
        align="start"
      >
        <Command
          className="h-auto"
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Search by name or part #..." />
          <CommandList className="max-h-[240px]">
            <CommandEmpty>No items found.</CommandEmpty>

            {products.length > 0 && (
              <CommandGroup heading="Products">
                {products.map((p) => {
                  const key = `product:${p.id}`;
                  const searchStr = [p.name, p.partNumber, p.category].filter(Boolean).join(" ");
                  return (
                    <CommandItem
                      key={key}
                      value={searchStr}
                      onSelect={() => { onValueChange(key); setOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4 shrink-0", value === key ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        {p.partNumber && (
                          <p className="font-mono text-xs text-slate-400">{p.partNumber}</p>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {parts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Parts">
                  {parts.map((p) => {
                    const key = `part:${p.id}`;
                    const searchStr = [p.name, p.partNumber, p.category].filter(Boolean).join(" ");
                    return (
                      <CommandItem
                        key={key}
                        value={searchStr}
                        onSelect={() => { onValueChange(key); setOpen(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4 shrink-0", value === key ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          {p.partNumber && (
                            <p className="font-mono text-xs text-slate-400">{p.partNumber}</p>
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
        {(onCreateNewProduct || onCreateNewPart) && (
          <div className="border-t p-1 flex gap-1">
            {onCreateNewProduct && (
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-blue-600 hover:bg-slate-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onCreateNewProduct();
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New Product
              </button>
            )}
            {onCreateNewProduct && onCreateNewPart && (
              <div className="w-px bg-slate-200" />
            )}
            {onCreateNewPart && (
              <button
                type="button"
                className="flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-xs text-blue-600 hover:bg-slate-100"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  onCreateNewPart();
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New Part
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
