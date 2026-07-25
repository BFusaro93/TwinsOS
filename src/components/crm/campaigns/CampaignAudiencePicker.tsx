"use client";

import { useMemo, useState } from "react";
import { useClients } from "@/lib/hooks/use-clients";
import { useClientFilterFields } from "@/lib/hooks/use-client-filter-fields";
import { ClientFilterPopover } from "@/components/crm/shared/ClientFilterPopover";
import { matchesAllFilterRows, type FilterRow } from "@/lib/client-filters";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function CampaignAudiencePicker({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { data: clients = [], isLoading } = useClients();
  const { fields, ctx } = useClientFilterFields();
  const [search, setSearch] = useState("");
  const [hideDoNotMarket, setHideDoNotMarket] = useState(true);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (hideDoNotMarket && c.doNotMarket) return false;
      if (search && !c.displayName.toLowerCase().includes(search.toLowerCase())) return false;
      return matchesAllFilterRows(c, filterRows, ctx);
    });
  }, [clients, search, hideDoNotMarket, filterRows, ctx]);

  const selectedSet = new Set(selectedIds);
  const toggle = (id: string) => {
    onChange(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="h-7 pl-6 text-xs"
          />
        </div>
        <ClientFilterPopover fields={fields} rows={filterRows} onRowsChange={setFilterRows} />
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-600">
          <Checkbox
            checked={hideDoNotMarket}
            onCheckedChange={(v) => setHideDoNotMarket(v === true)}
          />
          Hide Do Not Market
        </label>
      </div>

      <div className="max-h-52 overflow-y-auto rounded border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-8 px-2 py-1.5"></th>
              <th className="px-2 py-1.5 text-left">Client</th>
              <th className="px-2 py-1.5 text-left">Email</th>
              <th className="px-2 py-1.5 text-left">Marketing</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-400 italic">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-2 py-3 text-center text-slate-400 italic">No clients match</td></tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t hover:bg-slate-50"
                  onClick={() => toggle(c.id)}
                >
                  <td className="px-2 py-1.5">
                    <Checkbox checked={selectedSet.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                  </td>
                  <td className="px-2 py-1.5 font-medium text-slate-700">{c.displayName}</td>
                  <td className="px-2 py-1.5 text-slate-500">{c.primaryEmail ?? "—"}</td>
                  <td className="px-2 py-1.5">
                    {c.doNotMarket && (
                      <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        Do Not Market
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className={cn("text-[11px]", selectedIds.length === 0 ? "text-amber-600" : "text-slate-400")}>
        {selectedIds.length} client{selectedIds.length !== 1 ? "s" : ""} selected
      </p>
    </div>
  );
}
