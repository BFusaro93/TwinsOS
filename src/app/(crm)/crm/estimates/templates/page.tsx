"use client";

import { ClipboardSignature } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { EstimateTemplatesList } from "@/components/crm/estimates/EstimateTemplatesList";

export default function EstimateTemplatesPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  if (!permissionsLoading && !can("estimate_list")) {
    return (
      <EmptyState
        icon={ClipboardSignature}
        title="No access"
        description="You don't have permission to view Service Bundles."
      />
    );
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Service Bundles</h1>
        <p className="text-sm text-muted-foreground">
          Reusable line item sets that pre-populate new estimates
        </p>
      </div>
      <EstimateTemplatesList />
    </div>
  );
}
