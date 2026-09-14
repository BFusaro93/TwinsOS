"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { ServicesList } from "@/components/crm/services/ServicesList";
import { ServiceDialog } from "@/components/crm/services/ServiceDialog";
import { PriceAdjustmentForm } from "@/components/crm/pricing/PriceAdjustmentForm";
import { PriceAdjustmentHistory } from "@/components/crm/pricing/PriceAdjustmentHistory";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import type { CRMService } from "@/types/crm-jobs";

/**
 * Catalog and re-pricing live on one page because they are two halves of the
 * same job ("change my prices") — the catalog dialog moves the rates that seed
 * NEW records, the adjustment runs move the per-client rates that actually
 * bill. Splitting them across the sidebar hid that relationship and added a
 * tenth entry to an already-long Administration section.
 */
type Tab = "catalog" | "adjustments" | "history";

export default function ServicesPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canAdjustPrices = can("pricing_adjustment_run");
  const [tab, setTab] = useState<Tab>("catalog");
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

  if (!permissionsLoading && !can("service_list")) {
    return (
      <EmptyState
        icon={Layers}
        title="No access"
        description="You don't have permission to view Services."
      />
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "catalog", label: "Service Catalog" },
    ...(canAdjustPrices
      ? ([
          { key: "adjustments", label: "Price Adjustments" },
          { key: "history", label: "Adjustment History" },
        ] as { key: Tab; label: string }[])
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Services &amp; Pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tab === "catalog"
            ? "Manage your service catalog, pricing modes, production rates, and rate matrices."
            : "Re-price live client work in bulk. Preview every line before it is written, and undo a whole run afterwards."}
        </p>
      </div>

      {tabs.length > 1 && (
        <div className="mb-5 flex w-fit overflow-hidden rounded-md border text-xs">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 transition-colors ${
                tab === t.key
                  ? "bg-brand-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === "catalog" && <ServicesList onAdd={openAdd} onEdit={openEdit} />}
      {tab === "adjustments" && canAdjustPrices && (
        <PriceAdjustmentForm onApplied={() => setTab("history")} />
      )}
      {tab === "history" && canAdjustPrices && <PriceAdjustmentHistory />}

      <ServiceDialog open={dialogOpen} service={editing} onClose={handleClose} />
    </div>
  );
}
