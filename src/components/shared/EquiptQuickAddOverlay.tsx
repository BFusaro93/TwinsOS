"use client";

import { useQuickAddStore } from "@/stores/quick-add-store";
import { NewRequisitionDialog } from "@/components/po/NewRequisitionDialog";
import { NewPODialog } from "@/components/po/NewPODialog";
import { NewWorkOrderDialog } from "@/components/cmms/NewWorkOrderDialog";
import { NewVendorDialog } from "@/components/shared/NewVendorDialog";

export function EquiptQuickAddOverlay() {
  const { type, close } = useQuickAddStore();

  return (
    <>
      <NewRequisitionDialog open={type === "requisition"} onOpenChange={(o) => !o && close()} />
      <NewPODialog open={type === "purchase_order"} onOpenChange={(o) => !o && close()} />
      <NewWorkOrderDialog open={type === "work_order"} onOpenChange={(o) => !o && close()} />
      <NewVendorDialog open={type === "vendor"} onOpenChange={(o) => !o && close()} />
    </>
  );
}
