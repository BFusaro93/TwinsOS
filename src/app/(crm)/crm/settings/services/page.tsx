"use client";

import { useState } from "react";
import { ServicesList } from "@/components/crm/services/ServicesList";
import { ServiceDialog } from "@/components/crm/services/ServiceDialog";
import type { CRMService } from "@/types/crm-jobs";

export default function ServicesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CRMService | null>(null);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(s: CRMService) {
    setEditing(s);
    setDialogOpen(true);
  }

  function handleClose() {
    setDialogOpen(false);
    setEditing(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Services</h1>
        <p className="text-slate-500 text-sm mt-1">
          Manage your service catalog, pricing modes, production rates, and rate matrices.
        </p>
      </div>

      <ServicesList onAdd={openAdd} onEdit={openEdit} />

      <ServiceDialog
        open={dialogOpen}
        service={editing}
        onClose={handleClose}
      />
    </div>
  );
}
