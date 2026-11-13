"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MasterRouteBuilder } from "@/components/crm/snow/MasterRouteBuilder";

/** The Master Route builder in a dialog, opened from the Snow Dispatch board. */
export function MasterRoutesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Master Routes</DialogTitle>
          <DialogDescription>
            The saved stop order each crew follows. New storms come up in this order.
          </DialogDescription>
        </DialogHeader>
        <MasterRouteBuilder />
      </DialogContent>
    </Dialog>
  );
}
