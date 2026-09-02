"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { PackagesList } from "@/components/crm/packages/PackagesList";
import { PackageDialog } from "@/components/crm/packages/PackageDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";

export default function PackagesPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!permissionsLoading && !can("package_list")) {
    return (
      <EmptyState
        icon={Package}
        title="No access"
        description="You don't have permission to view Packages."
      />
    );
  }

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
