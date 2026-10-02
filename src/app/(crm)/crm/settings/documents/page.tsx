"use client";

import { FileEdit } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { DocumentsList } from "@/components/crm/documents/DocumentsList";

export default function DocumentsSettingsPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  if (!permissionsLoading && !can("document_template_list")) {
    return (
      <EmptyState
        icon={FileEdit}
        title="No access"
        description="You don't have permission to view Documents."
      />
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
        <p className="text-slate-500 text-sm mt-1">
          Email templates with merge tags for estimates, invoices, and client communications.
        </p>
      </div>
      <DocumentsList />
    </div>
  );
}
