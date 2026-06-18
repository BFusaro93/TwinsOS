"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PODetailPanel } from "./PODetailPanel";
import { NewPODialog } from "./NewPODialog";
import type { PurchaseOrder } from "@/types";

interface PODetailSheetProps {
  po: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PODetailSheet({ po, open, onOpenChange }: PODetailSheetProps) {
  const [editOpen, setEditOpen] = useState(false);

  if (!po) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[680px] md:max-w-[680px]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{po.poNumber}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <PODetailPanel key={po.id} po={po} onEditClick={() => setEditOpen(true)} />
          </div>
        </SheetContent>
      </Sheet>
      {/* Rendered outside the Sheet to avoid nested Radix overlay conflicts */}
      <NewPODialog open={editOpen} onOpenChange={setEditOpen} initialData={po} />
    </>
  );
}
