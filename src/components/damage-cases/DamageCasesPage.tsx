"use client";

import { useState } from "react";
import { Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDamageCases } from "@/lib/hooks/use-damage-cases";
import { DamageCaseDetailPanel } from "./DamageCaseDetailPanel";
import { DamageCasesChart } from "./DamageCasesChart";
import { NewDamageCaseDialog } from "./NewDamageCaseDialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DAMAGE_CASE_STATUS_LABELS, DAMAGE_CASE_TYPE_LABELS } from "@/lib/constants";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-slate-100 text-slate-600",
};

const TYPE_COLORS: Record<string, string> = {
  damage: "bg-red-100 text-red-800",
  warranty: "bg-purple-100 text-purple-800",
};

export function DamageCasesPage() {
  const { data: cases = [], isLoading } = useDamageCases();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);

  const filtered = cases.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.customerName.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.caseNumber.toLowerCase().includes(q) ||
      (c.propertyAddress ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h1 className="text-xl font-bold">Damage Cases</h1>
        </div>
        <Button onClick={() => setNewCaseOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Open Case
        </Button>
      </div>

      <Tabs defaultValue="cases">
        <TabsList>
          <TabsTrigger value="cases">Cases</TabsTrigger>
          <TabsTrigger value="reporting">Reporting</TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="mt-4 space-y-4">
          <Input
            placeholder="Search by customer, case #, or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          <div className="rounded-lg border bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Incident Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      {search ? "No cases match your search." : "No damage cases yet. Open the first case to get started."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setSelectedId(c.id)}
                    >
                      <TableCell className="font-mono text-xs text-muted-foreground">{c.caseNumber}</TableCell>
                      <TableCell>
                        <Badge className={`${TYPE_COLORS[c.caseType]} text-xs`}>
                          {DAMAGE_CASE_TYPE_LABELS[c.caseType]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{c.customerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{c.description}</TableCell>
                      <TableCell className="text-sm">{formatDate(c.dateOfIncident)}</TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_COLORS[c.status]} text-xs`}>
                          {DAMAGE_CASE_STATUS_LABELS[c.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(c.totalCost)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="reporting" className="mt-4">
          <DamageCasesChart />
        </TabsContent>
      </Tabs>

      {/* Detail sheet */}
      <Sheet open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl p-0 overflow-hidden">
          {selectedId && <DamageCaseDetailPanel caseId={selectedId} />}
        </SheetContent>
      </Sheet>

      <NewDamageCaseDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        onCreated={(id) => setSelectedId(id)}
      />
    </div>
  );
}
