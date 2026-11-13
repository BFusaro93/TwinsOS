"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useUpsertSubitem,
  type LineItemSubitem,
} from "@/lib/hooks/use-line-item-subitems";
import { useProducts } from "@/lib/hooks/use-products";
import { CatalogItemCombobox } from "@/components/shared/CatalogItemCombobox";
import { useCRMServices } from "@/lib/hooks/use-crm-jobs";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { mutationErrorMessage } from "@/lib/utils/mutation-error";

interface Props {
  lineItemId: string;
  /** The parent estimate line's visits, for the Visits sanity warning. */
  parentVisits?: number;
  subitem?: LineItemSubitem;
  open: boolean;
  onClose: () => void;
}

interface FormState {
  name: string;
  type: "product" | "subservice";
  productId: string | null;
  serviceId: string | null;
  qty: number;
  visits: number;
  rateDollars: number;
  costDollars: number;
  confirmQty: boolean;
  invoice: boolean;
  printOnEstimate: boolean;
  printOnInvoice: boolean;
  createInstalledProduct: boolean;
}

function getInitialState(subitem?: LineItemSubitem): FormState {
  if (subitem) {
    return {
      name: subitem.name,
      type: subitem.type,
      productId: subitem.productId,
      serviceId: subitem.serviceId,
      qty: subitem.qty,
      visits: subitem.visits,
      rateDollars: subitem.rateCents / 100,
      costDollars: subitem.costCents / 100,
      confirmQty: subitem.confirmQty,
      invoice: subitem.invoice,
      printOnEstimate: subitem.printOnEstimate,
      printOnInvoice: subitem.printOnInvoice,
      createInstalledProduct: subitem.createInstalledProduct,
    };
  }
  return {
    name: "",
    type: "product",
    productId: null,
    serviceId: null,
    qty: 1,
    visits: 1,
    rateDollars: 0,
    costDollars: 0,
    confirmQty: false,
    invoice: false,
    printOnEstimate: true,
    printOnInvoice: false,
    createInstalledProduct: false,
  };
}

export function AddSubitemDialog({ lineItemId, parentVisits = 1, subitem, open, onClose }: Props) {
  const [form, setForm] = useState<FormState>(() => getInitialState(subitem));
  const { mutateAsync: upsert, isPending } = useUpsertSubitem();
  const { data: allProducts = [] } = useProducts();
  const products = allProducts.filter((p) => p.category !== "maintenance_part");
  const { data: services = [] } = useCRMServices();
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const selectedService = form.serviceId ? services.find((s) => s.id === form.serviceId) ?? null : null;

  // Reset when dialog opens/closes or subitem changes
  useEffect(() => {
    if (open) {
      setForm(getInitialState(subitem));
    }
  }, [open, subitem]);

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function selectProduct(value: string) {
    const productId = value.startsWith("product:") ? value.slice("product:".length) : null;
    const product = productId ? products.find((p) => p.id === productId) ?? null : null;
    setForm((prev) => ({
      ...prev,
      productId,
      name: product ? product.name : prev.name,
      rateDollars: product ? product.price / 100 : prev.rateDollars,
      costDollars: product ? product.unitCost / 100 : prev.costDollars,
    }));
  }

  // Picking a catalog service pre-fills name, rate and cost from the service's
  // defaults (all still editable) — same behavior as picking a product.
  function selectService(serviceId: string) {
    const service = services.find((s) => s.id === serviceId) ?? null;
    setForm((prev) => ({
      ...prev,
      serviceId: service ? service.id : null,
      name: service ? service.name : prev.name,
      rateDollars: service?.defaultRateCents != null ? service.defaultRateCents / 100 : prev.rateDollars,
      costDollars: service ? service.defaultBCostCents / 100 : prev.costDollars,
    }));
  }

  // Price off the ROUNDED per-unit rate that is stored, not the raw dollar
  // input: a rate typed as $0.145 saves as 15c (rateCents), so a total of
  // qty x 14.5c disagreed with the qty x rate printed beside it.
  const rateCents = Math.round(form.rateDollars * 100);
  const totalCents = Math.round(form.qty * rateCents * form.visits);

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      await upsert({
        lineItemId,
        item: {
          ...(subitem ? { id: subitem.id } : {}),
          type: form.type,
          productId: form.productId,
          serviceId: form.serviceId,
          name: form.name.trim(),
          qty: form.qty,
          visits: form.visits,
          rateCents,
          costCents: Math.round(form.costDollars * 100),
          totalCents,
          confirmQty: form.confirmQty,
          invoice: form.invoice,
          printOnEstimate: form.printOnEstimate,
          printOnInvoice: form.printOnInvoice,
          createInstalledProduct: form.createInstalledProduct,
          sortOrder: subitem?.sortOrder ?? 0,
        },
      });
      onClose();
    } catch (err) {
      toast.error(mutationErrorMessage(err, "Failed to save sub-item"));
    }
  }

  const isEdit = !!subitem;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Sub-Item" : "Add Sub-Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => {
                setField("type", v as "product" | "subservice");
                if (v !== "product") setField("productId", null);
                if (v !== "subservice") setField("serviceId", null);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="subservice">Subservice</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Product catalog selection — pre-fills Name, Rate (sale price), and Cost (unit cost) */}
          {form.type === "product" && (
            <div className="space-y-1.5">
              <Label>Product</Label>
              <CatalogItemCombobox
                products={products}
                parts={[]}
                value={form.productId ? `product:${form.productId}` : ""}
                onValueChange={selectProduct}
                placeholder="Select product…"
              />
            </div>
          )}

          {/* Service catalog selection — pre-fills Name, Rate and Cost from the service */}
          {form.type === "subservice" && (
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Popover open={servicePickerOpen} onOpenChange={setServicePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={servicePickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className={cn("truncate", !selectedService && "text-muted-foreground")}>
                      {selectedService?.name ?? "Select service from catalog…"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start" onWheel={(e) => e.stopPropagation()}>
                  <Command
                    filter={(itemValue, search) =>
                      itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                    }
                  >
                    <CommandInput placeholder="Search services..." />
                    <CommandList className="!max-h-[240px]">
                      <CommandEmpty>No services found.</CommandEmpty>
                      <CommandGroup>
                        {services.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={[s.name, s.code, s.category].filter(Boolean).join(" ")}
                            onSelect={() => { selectService(s.id); setServicePickerOpen(false); }}
                          >
                            <Check className={cn("mr-2 h-4 w-4 shrink-0", form.serviceId === s.id ? "opacity-100" : "opacity-0")} />
                            <p className="truncate text-sm font-medium">{s.name}</p>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-[11px] text-muted-foreground">Or type a custom name below.</p>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="subitem-name">Name <span className="text-red-500 dark:text-red-400">*</span></Label>
            <Input
              id="subitem-name"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Mulch, Fertilizer, Subcontractor"
              autoFocus={form.type !== "product"}
            />
          </div>

          {/* Qty + Rate + Cost in a row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="subitem-visits" title="How many times this is charged. 1 = once for the whole line; set it to the line's visits to charge it on every visit.">Visits</Label>
              <Input
                id="subitem-visits"
                type="number"
                min={1}
                step={1}
                value={form.visits || ""}
                onChange={(e) => setField("visits", Math.max(1, Math.round(Number(e.target.value)) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subitem-qty">Qty</Label>
              <Input
                id="subitem-qty"
                type="number"
                min={0}
                step="any"
                value={form.qty || ""}
                onChange={(e) => setField("qty", Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subitem-rate" title="Sale price charged to the client — pre-fills from the product's price when selected, editable">Rate ($)</Label>
              <Input
                id="subitem-rate"
                type="number"
                min={0}
                step="0.01"
                value={form.rateDollars || ""}
                onChange={(e) => setField("rateDollars", Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subitem-cost" title="Your cost for this item — pre-fills from the product's unit cost when selected, editable">Cost ($)</Label>
              <Input
                id="subitem-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.costDollars || ""}
                onChange={(e) => setField("costDollars", Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {parentVisits > 1 && form.visits !== 1 && form.visits !== parentVisits && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠ This line has {parentVisits} visits. A sub-item can&apos;t be limited to some visits: Visits {form.visits} gets
              spread across all {parentVisits}, with uneven cents on each invoice. Use 1 (once for the whole line) or {parentVisits} (every visit).
            </p>
          )}

          {/* Total read-only */}
          <div className="flex items-center justify-between rounded-md bg-slate-50 dark:bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-slate-900 dark:text-neutral-100">
              ${(totalCents / 100).toFixed(2)}
            </span>
          </div>

          {/* The two flags the app acts on (also the On estimate / On invoice buttons on the line).
              Confirm Qty / Invoice / Create Installed Product were stored but never read, so they are gone. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="subitem-printOnEstimate"
                checked={form.printOnEstimate}
                onCheckedChange={(v) => setField("printOnEstimate", !!v)}
              />
              <Label htmlFor="subitem-printOnEstimate" className="cursor-pointer text-sm font-normal">
                Print on Estimate
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="subitem-printOnInvoice"
                checked={form.printOnInvoice}
                onCheckedChange={(v) => setField("printOnInvoice", !!v)}
              />
              <Label htmlFor="subitem-printOnInvoice" className="cursor-pointer text-sm font-normal">
                Print on Invoice
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Sub-Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
