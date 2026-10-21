"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { useWarranties } from "@/lib/hooks/use-warranties";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatWarrantyTerm } from "@/lib/utils/warranty";
import { WarrantyDialog } from "./WarrantyDialog";
import { WarrantyStatusBadge, warrantyDisplayState, type WarrantyDisplayState } from "./WarrantyStatusBadge";
import { WarrantyTypesDialog } from "./WarrantyTypesDialog";

export function WarrantiesPage() {
  const { data: warranties = [], isLoading } = useWarranties();
  const { can } = usePermissions();
  const { today } = useOrgDates();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | WarrantyDisplayState>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return warranties.filter((w) => {
      if (q && !`${w.name} ${w.clientName ?? ""} ${w.projectName ?? ""}`.toLowerCase().includes(q)) return false;
      return filter === "all" || warrantyDisplayState(w, today()).state === filter;
    });
  }, [warranties, search, filter, today]);

  const expiring = warranties.filter((w) => warrantyDisplayState(w, today()).state === "expiring").length;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Warranties</h1>
          <p className="text-sm text-muted-foreground">
            {warranties.length} total{expiring > 0 ? ` · ${expiring} expiring soon` : ""}
          </p>
        </div>
        {can("warranty_manage") && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setTypesOpen(true)}><Settings2 className="mr-1 h-4 w-4" /> Types</Button>
            <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add warranty</Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search client, project or warranty…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="pending">Not started</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Warranty</th><th className="px-3 py-2">Client</th><th className="px-3 py-2">Project</th>
              <th className="px-3 py-2">Term</th><th className="px-3 py-2">Starts</th><th className="px-3 py-2">Expires</th>
              <th className="px-3 py-2 text-right">Claims</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No warranties match.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2 font-medium">{w.name}</td>
                <td className="px-3 py-2"><Link className="hover:underline" href={`/crm/clients/${w.clientId}`}>{w.clientName ?? "—"}</Link></td>
                <td className="px-3 py-2">{w.projectName ?? "—"}</td>
                <td className="px-3 py-2">{formatWarrantyTerm(w.durationMonths)}</td>
                <td className="px-3 py-2">{formatDate(w.startDate)}</td>
                <td className="px-3 py-2">{formatDate(w.endDate)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{w.claimCount > 0 ? `${w.claimCount} · ${formatCurrency(w.claimedCents)}` : "—"}</td>
                <td className="px-3 py-2"><WarrantyStatusBadge warranty={w} today={today()} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <WarrantyDialog open={addOpen} onOpenChange={setAddOpen} />
      <WarrantyTypesDialog open={typesOpen} onOpenChange={setTypesOpen} />
    </div>
  );
}
