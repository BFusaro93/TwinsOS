"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "lucide-react";
import { useVendors } from "@/lib/hooks/use-vendors";

interface VendorRef {
  vendorId: string;
  vendorName: string;
}

interface ManageVendorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primaryVendor: VendorRef | null;
  alternateVendors: VendorRef[];
  onSave: (primary: VendorRef | null, alternates: VendorRef[]) => void;
}

export function ManageVendorsDialog({
  open,
  onOpenChange,
  primaryVendor,
  alternateVendors,
  onSave,
}: ManageVendorsDialogProps) {
  const { data: allVendors } = useVendors();
  const [primary, setPrimary] = useState<VendorRef | null>(primaryVendor);
  const [alternates, setAlternates] = useState<VendorRef[]>(alternateVendors);

  // Sync local state when dialog opens with new props
  useEffect(() => {
    if (open) {
      setPrimary(primaryVendor);
      setAlternates(alternateVendors);
    }
  }, [open, primaryVendor, alternateVendors]);

  const associatedIds = new Set<string>();
  if (primary) associatedIds.add(primary.vendorId);
  alternates.forEach((v) => associatedIds.add(v.vendorId));

  const availableVendors = (allVendors ?? []).filter(
    (v) => v.isActive && !associatedIds.has(v.id)
  );

  function handleRemove(vendorId: string) {
    if (primary?.vendorId === vendorId) {
      // Promote first alternate to primary
      const [next, ...rest] = alternates;
      setPrimary(next ?? null);
      setAlternates(rest);
    } else {
      setAlternates((prev) => prev.filter((v) => v.vendorId !== vendorId));
    }
  }

  function handleAdd(vendorId: string) {
    const vendor = (allVendors ?? []).find((v) => v.id === vendorId);
    if (!vendor) return;
    const ref: VendorRef = { vendorId: vendor.id, vendorName: vendor.name };
    if (!primary) {
      setPrimary(ref);
    } else {
      setAlternates((prev) => [...prev, ref]);
    }
  }

  function handleSave() {
    onSave(primary, alternates);
    onOpenChange(false);
  }

  const allAssociated: Array<VendorRef & { isPrimary: boolean }> = [];
  if (primary) allAssociated.push({ ...primary, isPrimary: true });
  alternates.forEach((v) => allAssociated.push({ ...v, isPrimary: false }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Vendors</DialogTitle>
          <DialogDescription>
            Add or remove vendor associations. The first vendor is the primary supplier.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Current vendors */}
          {allAssociated.length > 0 ? (
            <div className="flex flex-col gap-2">
              {allAssociated.map((v) => (
                <div
                  key={v.vendorId}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-700">{v.vendorName}</span>
                    {v.isPrimary && (
                      <Badge
                        variant="outline"
                        className="border-brand-200 bg-brand-50 text-brand-700 text-xs"
                      >
                        Primary
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-400 hover:text-red-500"
                    onClick={() => handleRemove(v.vendorId)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-slate-400">No vendors assigned</p>
          )}

          {/* Add vendor */}
          {availableVendors.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-500">Add Vendor</p>
              <Select onValueChange={handleAdd} value="">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {availableVendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
