"use client";

import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDocumentTemplate, useDocumentTemplates } from "@/lib/hooks/use-crm-documents";
import { useOrgSettings, useUpdateOrgSettings } from "@/lib/hooks/use-org-settings";
import {
  CONFIRMATION_KEYS,
  documentLacksEstimateLink,
  getConfirmationSettings,
  type ConfirmationRecipient,
} from "@/lib/estimates/confirmation-settings";

const NONE = "__none__";

export function EstimateConfirmationPanel() {
  const { data: orgSettings, isLoading } = useOrgSettings();
  const { mutateAsync: updateOrgSettings } = useUpdateOrgSettings();
  const { data: allDocs = [] } = useDocumentTemplates();
  const settings = getConfirmationSettings(orgSettings?.customizations);
  const { data: selectedDoc } = useDocumentTemplate(settings.documentId ?? "");

  if (isLoading || !orgSettings) {
    return <p className="text-sm text-slate-400 dark:text-neutral-500">Loading…</p>;
  }

  const candidates = allDocs.filter(
    (d) => (d.docType === "client" || d.docType === "estimate") && (d.status === "active" || d.id === settings.documentId),
  );
  const selectedInfo = allDocs.find((d) => d.id === settings.documentId);
  const staleDoc = settings.documentId && (!selectedInfo || selectedInfo.status !== "active");

  function save(changes: Record<string, unknown>) {
    updateOrgSettings({ customizations: changes }).catch(() => toast.error("Failed to save"));
  }

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-xs text-slate-400 dark:text-neutral-500">
        Choose the document emailed to a client right after they accept a proposal online. With no
        document selected, the built-in confirmation email is sent.
      </p>

      <div className="space-y-1.5">
        <Label className="text-xs">Confirmation document</Label>
        <Select
          value={settings.documentId ?? NONE}
          onValueChange={(v) => save({ [CONFIRMATION_KEYS.documentId]: v === NONE ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Built-in confirmation email</SelectItem>
            {candidates.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}{d.status !== "active" ? " (inactive)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {staleDoc && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            This document is inactive or deleted, so the built-in email is being sent instead.
          </p>
        )}
        {selectedDoc && selectedInfo?.status === "active" && documentLacksEstimateLink(selectedDoc.blocks) && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            This document has no [estimatelink] tag, so the email won&apos;t link back to the proposal.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Send to</Label>
        <Select
          value={settings.recipient}
          onValueChange={(v) => save({ [CONFIRMATION_KEYS.recipient]: v as ConfirmationRecipient })}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="billing_email">Billing email (falls back to primary email)</SelectItem>
            <SelectItem value="primary_email">Primary email</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div>
          <Label className="text-xs">Attach the estimate PDF</Label>
          <p className="text-xs text-slate-400 dark:text-neutral-500">Only applies when a document is selected.</p>
        </div>
        <Switch
          checked={settings.includeEstimatePdf}
          onCheckedChange={(v) => save({ [CONFIRMATION_KEYS.includeEstimatePdf]: v })}
        />
      </div>
    </div>
  );
}
