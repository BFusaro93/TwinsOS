"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PODetailPanel } from "./PODetailPanel";
import type { PurchaseOrder } from "@/types";

interface PODetailSheetProps {
  po: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PODetailSheet({ po, open, onOpenChange }: PODetailSheetProps) {
  if (!po) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[680px] flex-col overflow-hidden p-0 sm:max-w-[680px]">
        <SheetHeader className="sr-only">
          <SheetTitle>{po.poNumber}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <PODetailPanel key={po.id} po={po} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
