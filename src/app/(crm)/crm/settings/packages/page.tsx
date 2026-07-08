"use client";

import { useState } from "react";
import { PackagesList } from "@/components/crm/packages/PackagesList";
import { PackageDialog } from "@/components/crm/packages/PackageDialog";

export default function PackagesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Package Programs</h1>
        <p className="text-slate-500 text-sm mt-1">
          Define bundled service programs (e.g. 7-Step Fertilizer, Gold Maintenance). Packages can be included in a Contract or billed individually — either per visit as services are completed, or spread across monthly installments.
        </p>
      </div>

      <PackagesList
        onAdd={() => { setEditingId(null); setDialogOpen(true); }}
        onEdit={(pkg) => { setEditingId(pkg.id); setDialogOpen(true); }}
      />

      <PackageDialog
        open={dialogOpen}
        packageId={editingId}
        onClose={() => { setDialogOpen(false); setEditingId(null); }}
      />
    </div>
  );
}
