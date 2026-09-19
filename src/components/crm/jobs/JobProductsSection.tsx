"use client";

import { useState } from "react";
import {
  useCRMJobProducts,
  useAddCRMJobProduct,
  useUpdateCRMJobProduct,
  useDeleteCRMJobProduct,
  useSetJobProductStatus,
  type JobProductStatus,
  type CRMJobProduct,
} from "@/lib/hooks/use-crm-jobs";
import { useProducts } from "@/lib/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, ChevronDown } from "lucide-react";

// 'Used' vs 'Used, not billed' is the distinction that matters to the office at
// a glance: both mean the material left the shelf, but only the first is still
// going to appear on the customer's invoice.
export const JOB_PRODUCT_STATUS_LABEL: Record<JobProductStatus, string> = {
  pending: "Pending",
  used: "Used",
  invoiced: "Invoiced",
  used_no_invoice: "Used, not billed",
  not_used: "Not Used",
};

export const JOB_PRODUCT_STATUS_COLOR: Record<JobProductStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  // Amber, not blue: 'used' is an outstanding action for the office (it still
  // needs to reach an invoice), whereas used_no_invoice is a settled decision.
  used: "bg-amber-100 text-amber-700",
  invoiced: "bg-green-100 text-green-700",
  used_no_invoice: "bg-blue-100 text-blue-700",
  not_used: "bg-red-100 text-red-600",
};

/**
 * Parses a qty/price input.
 *
 * The old `parseFloat(x) || fallback` idiom silently rewrote a deliberate 0 to
 * the fallback and let a negative straight through — and a negative qty is not
 * cosmetic: `set_job_product_status` applies the row's qty as an inventory
 * delta, so "-5" *increases* on-hand by 5 when the row is later marked used.
 * Returns null for anything that isn't a finite number in range, so callers
 * can refuse the save instead of writing a guess.
 */
function parseNonNegative(raw: string): number | null {
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePositive(raw: string): number | null {
  const n = parseNonNegative(raw);
  return n != null && n > 0 ? n : null;
}

// Actions offered depend on the row's current status — mirrors Service
// Autopilot's per-line Invoiced/Used/Not-Used control. Entering 'invoiced' is
// never an action here (only the invoice-generation flow does that); this menu
// only ever leaves 'invoiced' or reopens/cancels a row.
function jobProductStatusActions(status: JobProductStatus): { label: string; next: JobProductStatus }[] {
  switch (status) {
    case "pending":
      return [
        { label: "Used, Invoice", next: "used" },
        { label: "Used, do not Invoice", next: "used_no_invoice" },
        { label: "Not Used, Cancel", next: "not_used" },
      ];
    case "used":
      return [
        { label: "Used, do not Invoice", next: "used_no_invoice" },
        { label: "Not Used, Cancel", next: "not_used" },
        { label: "Reopen to Pending", next: "pending" },
      ];
    case "invoiced":
      return [
        { label: "Remove from Invoice", next: "pending" },
        { label: "Used, do not Invoice", next: "used_no_invoice" },
        { label: "Not Used, Cancel", next: "not_used" },
      ];
    case "used_no_invoice":
      return [
        { label: "Used, Invoice", next: "used" },
        { label: "Not Used, Cancel", next: "not_used" },
        { label: "Reopen to Pending", next: "pending" },
      ];
    case "not_used":
      return [
        { label: "Used, Invoice", next: "used" },
        { label: "Reopen to Pending", next: "pending" },
      ];
  }
}

export function JobProductStatusMenu({ product, onChange }: {
  product: CRMJobProduct;
  onChange: (next: JobProductStatus) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold focus:outline-none",
            JOB_PRODUCT_STATUS_COLOR[product.status]
          )}
        >
          {JOB_PRODUCT_STATUS_LABEL[product.status]}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {jobProductStatusActions(product.status).map((a) => (
          <DropdownMenuItem key={a.next} onSelect={() => onChange(a.next)}>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Minimal shape JobProductsSection needs from a job's Services. */
export interface JobProductServiceOption {
  id: string;
  name: string;
}

/**
 * Editable Products (materials) table for a job — used/billed qty can differ
 * (see CRMJobProduct.invoiceQty). Shared between the full JobDetail page and
 * the dispatch board's job popup so a fix or feature here reaches both.
 *
 * Every product belongs to a Service (mirrors Estimates, where a product is
 * always attached to a service line rather than floating on its own) — the
 * Add/Edit rows won't submit without one picked from `services`.
 */
export function JobProductsSection({ jobId, services }: { jobId: string; services: JobProductServiceOption[] }) {
  const { data: jobProducts = [] } = useCRMJobProducts(jobId);
  const addJobProduct = useAddCRMJobProduct();
  const updateJobProduct = useUpdateCRMJobProduct();
  const deleteJobProduct = useDeleteCRMJobProduct();
  const setJobProductStatus = useSetJobProductStatus();
  const { data: productCatalog = [] } = useProducts();
  const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductId, setNewProductId] = useState("");
  const [newProductServiceId, setNewProductServiceId] = useState("");
  const [newProductQty, setNewProductQty] = useState("1");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductServiceId, setEditProductServiceId] = useState("");
  const [editProductQty, setEditProductQty] = useState("");
  const [editProductInvoiceQty, setEditProductInvoiceQty] = useState("");
  const [editProductPrice, setEditProductPrice] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <div className="bg-slate-50 border-b px-4 py-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Products</p>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Product</th>
              <th className="px-4 py-3 text-left">Service</th>
              <th className="px-4 py-3 text-right">QTY</th>
              <th className="px-4 py-3 text-right">QTY Invoiced</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Status</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody>
            {jobProducts.length === 0 && !addingProduct && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-sm">
                  No products on this job yet.
                </td>
              </tr>
            )}
            {jobProducts.map((p) => (
              <tr key={p.id} className="group border-b last:border-0">
                <td className="px-4 py-3 font-medium text-slate-800">{p.productName}</td>
                {editingProductId === p.id ? (
                  <>
                    <td className="px-2 py-2">
                      <Select value={editProductServiceId} onValueChange={setEditProductServiceId}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select service…" /></SelectTrigger>
                        <SelectContent>
                          {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Input type="number" min="0" step="0.01" value={editProductQty}
                        onChange={(e) => setEditProductQty(e.target.value)}
                        className="h-7 w-20 text-right text-sm ml-auto" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Input type="number" min="0" step="0.01" value={editProductInvoiceQty}
                        onChange={(e) => setEditProductInvoiceQty(e.target.value)}
                        placeholder={editProductQty || "same"}
                        title="Leave blank to invoice the same qty as used"
                        className="h-7 w-20 text-right text-sm ml-auto" />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <Input type="number" min="0" step="0.01" value={editProductPrice}
                        onChange={(e) => setEditProductPrice(e.target.value)}
                        placeholder="0.00"
                        className="h-7 w-24 text-right text-sm ml-auto" />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                      {parseNonNegative(editProductPrice) != null && parseNonNegative(editProductQty) != null
                        ? formatCurrency(Math.round(parseNonNegative(editProductPrice)! * 100) * parseNonNegative(editProductQty)!)
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold", JOB_PRODUCT_STATUS_COLOR[p.status])}>
                        {JOB_PRODUCT_STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={async () => {
                          if (!editProductServiceId) { toast.error("Select which service this product belongs to"); return; }
                          const qty = parsePositive(editProductQty);
                          if (qty == null) { toast.error("Quantity must be greater than 0"); return; }
                          const invoiceQty = editProductInvoiceQty.trim() ? parseNonNegative(editProductInvoiceQty) : null;
                          if (editProductInvoiceQty.trim() && invoiceQty == null) { toast.error("Invoiced quantity can't be negative"); return; }
                          const priceCents = editProductPrice.trim() ? parseNonNegative(editProductPrice) : 0;
                          if (priceCents == null) { toast.error("Unit price can't be negative"); return; }
                          try {
                            await updateJobProduct.mutateAsync({
                              id: p.id, jobId,
                              jobServiceId: editProductServiceId,
                              qty,
                              invoiceQty,
                              unitPriceCents: Math.round(priceCents * 100),
                            });
                            setEditingProductId(null);
                            toast.success("Product updated");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed to update product");
                          }
                        }} className="rounded p-1 hover:bg-green-50 text-green-600">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingProductId(null)} className="rounded p-1 hover:bg-slate-100 text-slate-400">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-500">
                      {p.jobServiceId ? (serviceNameById.get(p.jobServiceId) ?? "—") : <span className="text-amber-600">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.invoiceQty != null && p.invoiceQty !== p.qty
                        ? <span className="font-medium text-brand-600">{p.invoiceQty}</span>
                        : <span className="text-slate-400">{p.qty}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(p.unitPriceCents)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatCurrency(p.unitPriceCents * (p.invoiceQty ?? p.qty))}</td>
                    <td className="px-4 py-3 text-right">
                      <JobProductStatusMenu
                        product={p}
                        onChange={(next) => {
                          setJobProductStatus.mutate(
                            {
                              id: p.id,
                              jobId,
                              newStatus: next,
                              invoiceLineItemId: p.invoiceLineItemId,
                            },
                            {
                              onSuccess: () => toast.success(`Marked ${JOB_PRODUCT_STATUS_LABEL[next]}`),
                              onError: () => toast.error("Failed to update product status"),
                            }
                          );
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className={cn("flex justify-end gap-1", p.status === "pending" ? "opacity-0 group-hover:opacity-100" : "opacity-0")}>
                        <button disabled={p.status !== "pending"} onClick={() => {
                          setEditingProductId(p.id);
                          setEditProductServiceId(p.jobServiceId ?? "");
                          setEditProductQty(String(p.qty));
                          setEditProductInvoiceQty(p.invoiceQty != null ? String(p.invoiceQty) : "");
                          setEditProductPrice(String(p.unitPriceCents / 100));
                        }} className="rounded p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button disabled={p.status !== "pending"} onClick={async () => {
                          try {
                            await deleteJobProduct.mutateAsync({ id: p.id, jobId });
                            toast.success("Product removed");
                          } catch { toast.error("Failed to remove product"); }
                        }} className="rounded p-1 hover:bg-red-50 text-slate-400 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {addingProduct && (
              <tr className="border-t bg-slate-50">
                <td className="px-2 py-2">
                  <Select value={newProductId} onValueChange={(v) => {
                    const prod = productCatalog.find((p) => p.id === v);
                    setNewProductId(v);
                    if (prod) setNewProductPrice(String(prod.price / 100));
                  }}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select product…" /></SelectTrigger>
                    <SelectContent>
                      {productCatalog
                        .filter((p) => p.category === "stocked_material" || p.category === "project_material")
                        .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2">
                  <Select value={newProductServiceId} onValueChange={setNewProductServiceId}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Select service…" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-2 py-2 text-right">
                  <Input type="number" min="0" step="0.01" value={newProductQty}
                    onChange={(e) => setNewProductQty(e.target.value)}
                    className="h-7 w-20 text-right text-xs ml-auto" />
                </td>
                <td className="px-2 py-2 text-right text-xs text-slate-400">same</td>
                <td className="px-2 py-2 text-right">
                  <Input type="number" min="0" step="0.01" value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    placeholder="0.00"
                    className="h-7 w-24 text-right text-xs ml-auto" />
                </td>
                <td className="px-2 py-2 text-right tabular-nums text-xs text-slate-500">
                  {parseNonNegative(newProductPrice) != null && parseNonNegative(newProductQty) != null
                    ? formatCurrency(Math.round(parseNonNegative(newProductPrice)! * 100) * parseNonNegative(newProductQty)!)
                    : "—"}
                </td>
                <td className="px-2 py-2 text-right">
                  <span className={cn("inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold", JOB_PRODUCT_STATUS_COLOR.pending)}>
                    {JOB_PRODUCT_STATUS_LABEL.pending}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end gap-1">
                    <button onClick={async () => {
                      if (!newProductId) return;
                      const prod = productCatalog.find((p) => p.id === newProductId);
                      if (!prod) return;
                      if (!newProductServiceId) { toast.error("Select which service this product belongs to"); return; }
                      const qty = parsePositive(newProductQty);
                      if (qty == null) { toast.error("Quantity must be greater than 0"); return; }
                      const price = newProductPrice.trim() ? parseNonNegative(newProductPrice) : null;
                      if (newProductPrice.trim() && price == null) { toast.error("Unit price can't be negative"); return; }
                      try {
                        await addJobProduct.mutateAsync({
                          jobId,
                          jobServiceId: newProductServiceId,
                          productId: prod.id,
                          productName: prod.name,
                          qty,
                          unitPriceCents: price != null ? Math.round(price * 100) : prod.price,
                          unitCostCents: prod.unitCost ?? null,
                        });
                        setAddingProduct(false);
                        setNewProductId(""); setNewProductServiceId(""); setNewProductPrice(""); setNewProductQty("1");
                        toast.success("Product added");
                      } catch { toast.error("Failed to add product"); }
                    }} className="rounded p-1 hover:bg-green-50 text-green-600">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setAddingProduct(false)} className="rounded p-1 hover:bg-slate-100 text-slate-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {jobProducts.length > 0 && (
            <tfoot>
              <tr className="border-t bg-slate-50">
                <td colSpan={5} className="px-4 py-2 text-right text-xs font-semibold text-slate-500">Total</td>
                <td className="px-4 py-2 text-right font-bold text-slate-800">
                  {formatCurrency(jobProducts.reduce((s, p) => s + p.unitPriceCents * (p.invoiceQty ?? p.qty), 0))}
                </td>
                <td />
                <td />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
      {!addingProduct && (
        <div>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            disabled={services.length === 0}
            title={services.length === 0 ? "Add a service to this job first — every product must belong to one" : undefined}
            onClick={() => {
              setAddingProduct(true);
              setNewProductId("");
              // Default to the only service when there's exactly one — the
              // common case — so the picker isn't extra friction every time.
              setNewProductServiceId(services.length === 1 ? services[0]!.id : "");
              setNewProductPrice("");
              setNewProductQty("1");
            }}>
            <Plus className="mr-1 h-3 w-3" /> Add Product
          </Button>
          {services.length === 0 && (
            <p className="mt-1 text-[11px] text-slate-400">Add a service to this job first — every product must belong to one.</p>
          )}
        </div>
      )}
    </div>
  );
}
