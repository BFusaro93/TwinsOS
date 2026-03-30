"use client";

import { useState, useEffect } from "react";
import { Pencil, Trash2, Package } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useProjects } from "@/lib/hooks/use-projects";
import { useProducts } from "@/lib/hooks/use-products";
import type { LineItem } from "@/types";

interface LineItemsTableProps {
  lineItems: LineItem[];
  showProject?: boolean;
  editable?: boolean;
  onItemsChange?: (items: LineItem[]) => void;
  onProductClick?: (productId: string) => void;
  onProjectClick?: (projectId: string) => void;
}

export function LineItemsTable({
  lineItems,
  showProject = false,
  editable = false,
  onItemsChange,
  onProductClick,
  onProjectClick,
}: LineItemsTableProps) {
  const [items, setItems] = useState<LineItem[]>(lineItems);
  useEffect(() => { setItems(lineItems); }, [lineItems]);

  const { data: projects = [] } = useProjects();
  const { data: products = [] } = useProducts();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", unitCost: "", projectId: "none" });

  const editingItem = editingId ? items.find((li) => li.id === editingId) ?? null : null;

  function applyChange(next: LineItem[]) {
    setItems(next);
    onItemsChange?.(next);
  }

  function openEdit(li: LineItem) {
    setEditingId(li.id);
    setEditForm({
      quantity: String(li.quantity),
      unitCost: (li.unitCost / 100).toFixed(2),
      projectId: li.projectId ?? "none",
    });
  }

  function saveEdit() {
    if (!editingId) return;
    const quantity = Math.max(1, parseInt(editForm.quantity, 10) || 1);
    const unitCost = Math.round(parseFloat(editForm.unitCost) * 100) || 0;
    const projectId = editForm.projectId === "none" ? null : editForm.projectId;
    applyChange(
      items.map((li) =>
        li.id === editingId
          ? { ...li, quantity, unitCost: unitCost || li.unitCost, totalCost: quantity * (unitCost || li.unitCost), projectId }
          : li
      )
    );
    setEditingId(null);
  }

  function deleteItem(id: string) {
    applyChange(items.filter((li) => li.id !== id));
  }

  const grandTotal = items.reduce((sum, li) => sum + li.quantity * li.unitCost, 0);

  return (
    <>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 text-xs">
              <TableHead>Item</TableHead>
              <TableHead>Part #</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Cost</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {showProject && <TableHead>Project</TableHead>}
              {editable && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((li) => {
              const product = products.find((p) => p.id === li.productItemId);
              const thumbUrl = product?.pictureUrl;
              return (
              <TableRow key={li.id} className="group text-sm">
                <TableCell>
                  <div className="flex items-center gap-2">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt="" className="h-8 w-8 rounded object-cover" />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-100">
                        <Package className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                    {onProductClick ? (
                      <button
                        type="button"
                        onClick={() => onProductClick(li.productItemId)}
                        className="text-left font-medium text-brand-600 hover:underline"
                      >
                        {li.productItemName}
                      </button>
                    ) : (
                      <span className="font-medium">{li.productItemName}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-slate-500">
                  {li.partNumber ?? "—"}
                </TableCell>
                <TableCell className="text-right">{li.quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(li.unitCost)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(li.quantity * li.unitCost)}
                </TableCell>
                {showProject && (
                  <TableCell className="text-slate-500">
                    {li.projectId ? (
                      onProjectClick ? (
                        <button
                          type="button"
                          onClick={() => onProjectClick(li.projectId!)}
                          className="text-sm text-brand-600 hover:underline"
                        >
                          {projects.find((p) => p.id === li.projectId)?.name ?? li.projectId}
                        </button>
                      ) : (
                        <span>{projects.find((p) => p.id === li.projectId)?.name ?? li.projectId}</span>
                      )
                    ) : "—"}
                  </TableCell>
                )}
                {editable && (
                  <TableCell className="px-2 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => openEdit(li)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem(li.id)}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="flex justify-end border-t bg-slate-50 px-4 py-2">
          <span className="text-sm font-semibold text-slate-900">
            Total: {formatCurrency(grandTotal)}
          </span>
        </div>
      </div>

      {editable && (
        <Dialog open={!!editingItem} onOpenChange={(o) => { if (!o) setEditingId(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Edit Line Item</DialogTitle>
              <DialogDescription>
                {editingItem?.productItemName}
                {editingItem?.partNumber ? ` — ${editingItem.partNumber}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Quantity</label>
                  <Input
                    type="number"
                    min={1}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Unit Cost ($)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={editForm.unitCost}
                    onChange={(e) => setEditForm((f) => ({ ...f, unitCost: e.target.value }))}
                  />
                </div>
              </div>
              {showProject && projects.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Project</label>
                  <Select
                    value={editForm.projectId}
                    onValueChange={(val) => setEditForm((f) => ({ ...f, projectId: val }))}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="No project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button onClick={saveEdit} className="mt-1">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
