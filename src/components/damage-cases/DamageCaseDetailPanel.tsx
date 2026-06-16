"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDamageCase, useUpdateDamageCase, useDeleteDamageCaseExpense } from "@/lib/hooks/use-damage-cases";
import { AddExpenseDialog } from "./AddExpenseDialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { DAMAGE_CASE_STATUS_LABELS, DAMAGE_CASE_TYPE_LABELS } from "@/lib/constants";
import type { DamageCaseStatus } from "@/types";

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

interface Props {
  caseId: string;
}

export function DamageCaseDetailPanel({ caseId }: Props) {
  const { data, isLoading } = useDamageCase(caseId);
  const updateCase = useUpdateDamageCase();
  const deleteExpense = useDeleteDamageCaseExpense();
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!data) return null;

  const expenses = (data as { expenses?: import("@/types").DamageCaseExpense[] }).expenses ?? [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header — pr-12 reserves space for Sheet's absolute close button */}
      <div className="px-6 pt-6 pb-4 border-b space-y-3 pr-12">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{data.caseNumber}</span>
          <Badge className={TYPE_COLORS[data.caseType]}>{DAMAGE_CASE_TYPE_LABELS[data.caseType]}</Badge>
        </div>
        <div>
          <h2 className="text-lg font-semibold">{data.customerName}</h2>
          {data.propertyAddress && (
            <p className="text-sm text-muted-foreground">{data.propertyAddress}</p>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="text-sm">
            <span className="text-muted-foreground">Incident Date: </span>
            <span className="font-medium">{formatDate(data.dateOfIncident)}</span>
          </div>
          <Select
            value={data.status}
            onValueChange={(v) => updateCase.mutate({ id: data.id, status: v as DamageCaseStatus })}
          >
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DAMAGE_CASE_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-sm">
          <span className="text-muted-foreground">Description</span>
          <p className="mt-0.5">{data.description}</p>
        </div>

        {data.resolutionNotes && (
          <div className="text-sm">
            <span className="text-muted-foreground">Resolution Notes</span>
            <p className="mt-0.5">{data.resolutionNotes}</p>
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="flex-1 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Expenses</h3>
          <Button size="sm" variant="outline" onClick={() => setAddExpenseOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Expense
          </Button>
        </div>

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No expenses yet. Add the first expense to start tracking costs.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((exp) => (
                <TableRow key={exp.id}>
                  <TableCell className="text-sm">{formatDate(exp.expenseDate)}</TableCell>
                  <TableCell className="text-sm">{exp.vendorName ?? "—"}</TableCell>
                  <TableCell className="text-sm">{exp.description}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(exp.amount)}</TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteExpense.mutate({ id: exp.id, damageCaseId: data.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {expenses.length > 0 && (
          <>
            <Separator />
            <div className="flex justify-end text-sm font-semibold">
              <span className="text-muted-foreground mr-4">Total Cost</span>
              <span>{formatCurrency(data.totalCost)}</span>
            </div>
          </>
        )}
      </div>

      <AddExpenseDialog damageCaseId={data.id} open={addExpenseOpen} onOpenChange={setAddExpenseOpen} />
    </div>
  );
}
