"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInjuryCases } from "@/lib/hooks/use-injury-cases";
import { InjuryCaseDetailPanel } from "./InjuryCaseDetailPanel";
import { NewInjuryCaseDialog } from "./NewInjuryCaseDialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { INJURY_CASE_STATUS_LABELS, INJURY_CLAIM_ROUTE_LABELS, INJURY_SEVERITY_LABELS } from "@/lib/constants";
import { INJURY_STATUS_COLORS, INJURY_SEVERITY_COLORS } from "./injury-colors";
import { PageHeader } from "@/components/shared/PageHeader";
import { SearchInput } from "@/components/shared/SearchInput";

/** Whole days between two YYYY-MM-DD strings, parsed as local dates (no UTC shift). */
function daysBetween(fromYmd: string, to: Date): number {
  const [y, m, d] = fromYmd.split("-").map(Number);
  const from = new Date(y, m - 1, d);
  const today = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(0, Math.round((today.getTime() - from.getTime()) / 86_400_000));
}

function StatCard({ label, value, sub, valueClass }: { label: string; value: string | number; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm text-center">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${valueClass ?? "text-slate-900"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function InjuryCasesPage() {
  const { data: cases = [], isLoading } = useInjuryCases();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const stats = useMemo(() => {
    const now = new Date();
    const year = String(now.getFullYear());
    const ytd = cases.filter((c) => c.dateOfIncident.startsWith(year));
    const last = cases.reduce<string | null>(
      (latest, c) => (!latest || c.dateOfIncident > latest ? c.dateOfIncident : latest),
      null,
    );
    return {
      daysSince: last ? daysBetween(last, now) : null,
      lastDate: last,
      open: cases.filter((c) => c.status === "open" || c.status === "in_progress").length,
      closed: cases.filter((c) => c.status === "resolved" || c.status === "closed").length,
      ytd: ytd.length,
      recordableYtd: ytd.filter((c) => c.recordable).length,
      daysAwayYtd: ytd.reduce((s, c) => s + c.daysAway, 0),
    };
  }, [cases]);

  const filtered = cases.filter((c) => {
    if (statusFilter === "active" && !(c.status === "open" || c.status === "in_progress")) return false;
    if (statusFilter !== "all" && statusFilter !== "active" && c.status !== statusFilter) return false;
    const q = search.toLowerCase();
    return (
      !q ||
      c.employeeName.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.caseNumber.toLowerCase().includes(q) ||
      (c.injuryType ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Injury Cases"
        action={
          <Button size="sm" onClick={() => setNewCaseOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Open Case
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div className="col-span-2 lg:col-span-2">
          <StatCard
            label="Days Since Last Injury"
            value={isLoading ? "…" : stats.daysSince ?? "—"}
            sub={stats.lastDate ? `Last incident ${formatDate(stats.lastDate)}` : "No injuries on record"}
            valueClass="text-green-600"
          />
        </div>
        <StatCard label="Open" value={stats.open} valueClass="text-red-600" />
        <StatCard label="Closed" value={stats.closed} valueClass="text-green-600" />
        <StatCard label="Injuries YTD" value={stats.ytd} sub={`${stats.recordableYtd} recordable`} />
        <StatCard label="Days Away YTD" value={stats.daysAwayYtd} valueClass="text-orange-600" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by employee, case #, or description…"
          className="w-full max-w-sm"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Open + In Progress</SelectItem>
            {Object.entries(INJURY_CASE_STATUS_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case #</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Injury</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Incident Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Handling</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Days Away</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {search || statusFilter !== "all" ? "No cases match your filters." : "No injury cases yet. 🎉"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedId(c.id)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.caseNumber}</TableCell>
                  <TableCell className="font-medium">{c.employeeName}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                    {[c.injuryType, c.bodyPart].filter(Boolean).join(" · ") || c.description}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${INJURY_SEVERITY_COLORS[c.severity]} text-xs`}>{INJURY_SEVERITY_LABELS[c.severity]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(c.dateOfIncident)}</TableCell>
                  <TableCell>
                    <Badge className={`${INJURY_STATUS_COLORS[c.status]} text-xs`}>{INJURY_CASE_STATUS_LABELS[c.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.claimRoute ? INJURY_CLAIM_ROUTE_LABELS[c.claimRoute] : "—"}</TableCell>
                  <TableCell className="text-right text-sm">{c.totalCost > 0 ? formatCurrency(c.totalCost) : "—"}</TableCell>
                  <TableCell className="text-right text-sm">{c.daysAway}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl">
          {selectedId && <InjuryCaseDetailPanel caseId={selectedId} onClose={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>

      <NewInjuryCaseDialog open={newCaseOpen} onOpenChange={setNewCaseOpen} onCreated={(id) => setSelectedId(id)} />
    </div>
  );
}
