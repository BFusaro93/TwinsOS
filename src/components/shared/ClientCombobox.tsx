"use client";

import * as React from "react";
import Link from "next/link";
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
import { CLIENT_SEARCH_LIMIT, useClient, useClientDisplayName, useClientSearch } from "@/lib/hooks/use-clients";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import type { Client, ClientStatus } from "@/types/crm";

interface ClientComboboxProps {
  value: string; // client id, or "" for none selected
  /** `client` is the picked record (null when cleared) — saves callers a
   *  lookup for its name, address, etc. */
  onValueChange: (value: string, client: Client | null) => void;
  noneLabel?: string;
  id?: string;
  disabled?: boolean;
  /** Leave these statuses out — e.g. ["lead"] where a lead can't be billed. */
  excludeStatuses?: ClientStatus[];
  /** Never offer these clients (e.g. the client being edited). */
  excludeIds?: string[];
  /** When set, a first option with this label clears the selection. */
  clearLabel?: string;
  /** Name to show for `value` while (or if) its record can't be loaded —
   *  e.g. the client name stored on the estimate. */
  selectedLabel?: string | null;
}

/**
 * Client picker that searches on the server as you type (name, account #,
 * phone, email, address, tag) and shows at most 50 matches — orgs can have
 * thousands of clients, so it never loads the whole list.
 */
export function ClientCombobox({
  value,
  onValueChange,
  noneLabel = "Select client...",
  id,
  disabled,
  excludeStatuses,
  excludeIds,
  clearLabel,
  selectedLabel,
}: ClientComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const term = useDebouncedValue(search);

  const { data: clients = [], isFetching } = useClientSearch(term, { excludeStatuses, excludeIds }, open);
  // The selected client may not be in the current results — resolve its name
  // from its own (cached) record.
  const { data: selectedClient, isError: selectedMissing } = useClient(value);
  // useClient skips soft-deleted clients, so a record still pointing at a
  // deleted client rendered "Select client..." and invited an accidental
  // reassign. Show its name (marked deleted) instead.
  const { data: fallbackName } = useClientDisplayName(value, selectedMissing && !selectedLabel);
  const selectedName =
    selectedClient?.displayName ??
    selectedLabel ??
    (fallbackName ? `${fallbackName.displayName}${fallbackName.deleted ? " (deleted)" : ""}` : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selectedName && "text-muted-foreground")}>
            {selectedName ?? noneLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Results are already filtered server-side — cmdk mustn't re-filter them. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search clients..." value={search} onValueChange={setSearch} />
          <CommandList className="!max-h-[220px]">
            <CommandEmpty>
              {isFetching ? (
                "Searching…"
              ) : !term ? (
                // Nothing at all with no search typed: a new org's first
                // estimate/invoice — point at where clients are created.
                <span>
                  No clients yet.{" "}
                  <Link href="/crm/clients" className="font-medium text-brand-600 dark:text-brand-400 underline underline-offset-2">
                    Add a client
                  </Link>
                </span>
              ) : (
                "No clients found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {clearLabel && !term && (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onValueChange("", null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === "" ? "opacity-100" : "opacity-0")} />
                  <span className="text-sm text-muted-foreground">{clearLabel}</span>
                </CommandItem>
              )}
              {clients.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onValueChange(c.id, c);
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
                    <p className="truncate text-sm font-medium">
                      {c.displayName}
                      {c.status === "lead" && <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">(lead)</span>}
                      {c.accountNumber && <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-neutral-500">#{c.accountNumber}</span>}
                    </p>
                    {c.billingAddress && (
                      <p className="truncate text-xs text-slate-400 dark:text-neutral-500">{c.billingAddress}</p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {clients.length >= CLIENT_SEARCH_LIMIT && (
              <p className="px-3 py-1.5 text-center text-[11px] text-slate-400 dark:text-neutral-500">
                Showing the first {CLIENT_SEARCH_LIMIT} — keep typing to narrow it down.
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
