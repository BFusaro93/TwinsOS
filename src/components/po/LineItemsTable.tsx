"use client";

import { useState, useEffect } from "react";
import { Pencil, Trash2, Package, Plus, ChevronsUpDown, Check, Ban } from "lucide-react";
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
import { formatCurrency, cn } from "@/lib/utils";
import { useProjects } from "@/lib/hooks/use-projects";
import { useProducts } from "@/lib/hooks/use-products";
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
import type { LineItem } from "@/types";

interface LineItemsTableProps {
  lineItems: LineItem[];
  showProject?: boolean;
  editable?: boolean;
  onItemsChange?: (items: LineItem[]) => void;
  /** Called after a new item is added, with the added item and the full updated list. */
  onItemAdded?: (item: LineItem, updatedItems: LineItem[]) => void;
  /** Called after an item is edited, with the updated item and the full updated list. */
  onItemEdited?: (item: LineItem, updatedItems: LineItem[]) => void;
  /** Called after an item is deleted, with the deleted id and the full updated list. */
  onItemDeleted?: (id: string, updatedItems: LineItem[]) => void;
  onProductClick?: (productId: string) => void;
  onPartClick?: (partId: string) => void;
  onProjectClick?: (projectId: string) => void;
}

export function LineItemsTable({
  lineItems,
  showProject = false,
  editable = false,
  onItemsChange,
  onItemAdded,
  onItemEdited,
  onItemDeleted,
  onProductClick,
  onPartClick,
  onProjectClick,
}: LineItemsTableProps) {
  const [items, setItems] = useState<LineItem[]>(lineItems);
  useEffect(() => { setItems(lineItems); }, [lineItems]);

  const { data: projects = [] } = useProjects();
  const { data: products = [] } = useProducts();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: "", unitCost: "", projectId: "none", taxable: true });

  // Add line item dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ productId: "", quantity: "1", unitCost: "", projectId: "none", taxable: true });
  const [productComboOpen, setProductComboOpen] = useState(false);

  function openAdd() {
    setAddForm({ productId: "", quantity: "1", unitCost: "", projectId: "none", taxable: true });
    setAddOpen(true);
  }

  function saveAdd() {
    const product = products.find((p) => p.id === addForm.productId);
    if (!product) return;
    const quantity = Math.max(0.01, parseFloat(addForm.quantity) || 0.01);
    const unitCost = Math.round(parseFloat(addForm.unitCost) * 100) || 0;
    const projectId = addForm.projectId === "none" ? null : addForm.projectId;
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      productItemId: product.id,
      partId: null,
      productItemName: product.name,
      partNumber: product.partNumber ?? "",
      quantity,
      unitCost,
      totalCost: Math.round(quantity * unitCost),
      projectId,
      notes: null,
      taxable: addForm.taxable,
    };
    const next = [...items, newItem];
    applyChange(next);
    onItemAdded?.(newItem, next);
    setAddOpen(false);
  }

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
      taxable: li.taxable !== false,
    });
  }

  function saveEdit() {
    if (!editingId) return;
    const quantity = Math.max(0.01, parseFloat(editForm.quantity) || 0.01);
    const unitCost = Math.round(parseFloat(editForm.unitCost) * 100) || 0;
    const projectId = editForm.projectId === "none" ? null : editForm.projectId;
    const next = items.map((li) => {
      if (li.id !== editingId) return li;
      const cost = unitCost || li.unitCost;
      return { ...li, quantity, unitCost: cost, totalCost: Math.round(quantity * cost), projectId, taxable: editForm.taxable };
    });
    applyChange(next);
    const edited = next.find((li) => li.id === editingId);
    if (edited) onItemEdited?.(edited, next);
    setEditingId(null);
  }

  function deleteItem(id: string) {
    const next = items.filter((li) => li.id !== id);
    applyChange(next);
    onItemDeleted?.(id, next);
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
                    <div className="flex flex-col gap-0.5">
                    {onProductClick && li.productItemId ? (
                      <button
                        type="button"
                        onClick={() => onProductClick(li.productItemId!)}
                        className="text-left font-medium text-brand-600 hover:underline"
                      >
                        {li.productItemName}
                      </button>
                    ) : onPartClick && li.partId ? (
                      <button
                        type="button"
                        onClick={() => onPartClick(li.partId!)}
                        className="text-left font-medium text-brand-600 hover:underline"
                      >
                        {li.productItemName}
                      </button>
                    ) : (
                      <span className="font-medium">{li.productItemName}</span>
                    )}
                    {li.taxable === false && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400">
                        <Ban className="h-2.5 w-2.5" />
                        Non-taxable
                      </span>
                    )}
                    </div>
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
        <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-2">
          {editable ? (
            <button
              type="button"
              onClick={openAdd}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Line Item
            </button>
          ) : <span />}
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
                    min={0.01}
                    step={0.01}
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
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-brand-600"
                  checked={editForm.taxable}
                  onChange={(e) => setEditForm((f) => ({ ...f, taxable: e.target.checked }))}
                />
                Taxable
              </label>
              <Button onClick={saveEdit} className="mt-1">Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Add Line Item dialog */}
      {editable && (
        <Dialog open={addOpen} onOpenChange={(o) => { if (!o) setAddOpen(false); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add Line Item</DialogTitle>
              <DialogDescription>Select a product and enter quantity and unit cost.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">Product</label>
                <Popover open={productComboOpen} onOpenChange={setProductComboOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={productComboOpen}
                      className="w-full justify-between font-normal text-sm"
                    >
                      <span className={cn("truncate", !addForm.productId && "text-muted-foreground")}>
                        {addForm.productId
                          ? products.find((p) => p.id === addForm.productId)?.name ?? "Select product…"
                          : "Select product…"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                    <Command filter={(itemValue, search) =>
                      itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }>
                      <CommandInput placeholder="Search by name or part #…" />
                      <CommandList className="!max-h-[220px]">
                        <CommandEmpty>No products found.</CommandEmpty>
                        <CommandGroup>
                          {products.map((p) => {
                            const searchStr = [p.name, p.partNumber].filter(Boolean).join(" ");
                            return (
                              <CommandItem
                                key={p.id}
                                value={searchStr}
                                onSelect={() => {
                                  setAddForm((f) => ({
                                    ...f,
                                    productId: p.id,
                                    unitCost: p.unitCost != null
                                      ? (p.unitCost / 100).toFixed(2)
                                      : f.unitCost,
                                  }));
                                  setProductComboOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4 shrink-0", addForm.productId === p.id ? "opacity-100" : "opacity-0")} />
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
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex gap-3">
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Quantity</label>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={addForm.quantity}
                    onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Unit Cost ($)</label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={addForm.unitCost}
                    onChange={(e) => setAddForm((f) => ({ ...f, unitCost: e.target.value }))}
                  />
                </div>
              </div>
              {showProject && projects.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">Project</label>
                  <Select
                    value={addForm.projectId}
                    onValueChange={(val) => setAddForm((f) => ({ ...f, projectId: val }))}
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
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-brand-600"
                  checked={addForm.taxable}
                  onChange={(e) => setAddForm((f) => ({ ...f, taxable: e.target.checked }))}
                />
                Taxable
              </label>
              <Button onClick={saveAdd} disabled={!addForm.productId} className="mt-1">
                Add to PO
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
