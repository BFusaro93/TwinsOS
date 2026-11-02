"use client";

import { useMemo } from "react";
import { useDocumentTemplate, useDocumentTemplates } from "@/lib/hooks/use-crm-documents";
import { documentLacksEstimateLink } from "@/lib/estimates/confirmation-settings";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { DISPLAY_TOGGLES } from "@/components/crm/estimates/EstimateDisplaySettingsPanel";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/estimate-display-settings";
import type { ConfirmationRecipient } from "@/types/crm-documents";

/** The Estimate-type settings, edited as one unit by both document dialogs. */
export interface EstimateSettingsValue {
  estimateEmailDocumentId: string | null;
  confirmationDocumentId: string | null;
  confirmationRecipient: ConfirmationRecipient;
  confirmationIncludeEstimatePdf: boolean;
  /** null = this document sets no display toggles (bundle / org default applies). */
  displaySettings: DisplaySettings | null;
}

export const DEFAULT_ESTIMATE_SETTINGS: EstimateSettingsValue = {
  estimateEmailDocumentId: null,
  confirmationDocumentId: null,
  confirmationRecipient: "primary_email",
  confirmationIncludeEstimatePdf: false,
  displaySettings: null,
};

const NONE = "__none__";

function DocumentPicker({
  label,
  hint,
  value,
  onChange,
  options,
  warnIfNoEstimateLink,
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (id: string | null) => void;
  options: { id: string; name: string }[];
  warnIfNoEstimateLink?: boolean;
}) {
  // Load the chosen document's blocks only to check for the proposal link.
  const { data: chosen } = useDocumentTemplate(warnIfNoEstimateLink && value ? value : "");
  const lacksLink = !!chosen && documentLacksEstimateLink(chosen.blocks);
  const stale = !!value && !options.some((o) => o.id === value);

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Standard built-in email</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
          {stale && <SelectItem value={value!}>(Inactive or deleted document)</SelectItem>}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      {stale && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          The linked document was deleted or deactivated, so the standard email goes out instead. Choose another document.
        </p>
      )}
      {lacksLink && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          This document has no [estimatelink] tag or button link, so the email will not link to the proposal.
        </p>
      )}
    </div>
  );
}

export function EstimateSettingsFields({
  value,
  onChange,
  excludeId,
  includePdf,
  onIncludePdfChange,
}: {
  value: EstimateSettingsValue;
  onChange: (next: EstimateSettingsValue) => void;
  /** The document being edited, never offered as its own email. */
  excludeId?: string;
  includePdf: boolean;
  onIncludePdfChange: (v: boolean) => void;
}) {
  const { data: templates = [] } = useDocumentTemplates();
  const options = useMemo(
    () =>
      templates
        .filter((t) => t.docType === "client" && t.status === "active" && t.id !== excludeId)
        .map((t) => ({ id: t.id, name: t.name })),
    [templates, excludeId],
  );

  return (
    <div className="space-y-4 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-neutral-500">
        Estimate Settings
      </p>
      <DocumentPicker
        label="Estimate Email"
        hint="The email that carries this estimate. Pick a Client-type document with an [estimatelink] tag."
        value={value.estimateEmailDocumentId}
        onChange={(id) => onChange({ ...value, estimateEmailDocumentId: id })}
        options={options}
        warnIfNoEstimateLink
      />
      <div className="flex items-center gap-3">
        <Checkbox id="est-include-pdf" checked={includePdf} onCheckedChange={(c) => onIncludePdfChange(!!c)} />
        <Label htmlFor="est-include-pdf" className="cursor-pointer">Include PDF In Email</Label>
      </div>
      <DocumentPicker
        label="Estimate Confirmation Email"
        hint="Sent to the client when they accept the proposal."
        value={value.confirmationDocumentId}
        onChange={(id) => onChange({ ...value, confirmationDocumentId: id })}
        options={options}
        warnIfNoEstimateLink
      />
      <div className="space-y-1.5">
        <Label>Send Confirmation To</Label>
        <Select
          value={value.confirmationRecipient}
          onValueChange={(v) => onChange({ ...value, confirmationRecipient: v as ConfirmationRecipient })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="primary_email">Use Contact Email By Default</SelectItem>
            <SelectItem value="billing_email">Billing Email</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-3">
        <Checkbox
          id="est-confirm-pdf"
          checked={value.confirmationIncludeEstimatePdf}
          onCheckedChange={(c) => onChange({ ...value, confirmationIncludeEstimatePdf: !!c })}
        />
        <Label htmlFor="est-confirm-pdf" className="cursor-pointer">Send Estimate PDF in Client Confirmation</Label>
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex items-center gap-3">
          <Checkbox
            id="est-display-defaults"
            checked={value.displaySettings !== null}
            onCheckedChange={(c) =>
              onChange({ ...value, displaySettings: c ? { ...DEFAULT_DISPLAY_SETTINGS } : null })
            }
          />
          <Label htmlFor="est-display-defaults" className="cursor-pointer">Set What The Client Sees For This Document</Label>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Copied onto an estimate when it uses this document (overrides the service bundle and org defaults). Changing
          them later does not alter estimates already created. Leave off to use the bundle / org defaults.
        </p>
        {value.displaySettings && (
          <div className="divide-y rounded-md border border-border bg-card">
            {DISPLAY_TOGGLES.map((t) => (
              <div key={t.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <p className="text-sm">{t.label}</p>
                <Switch
                  checked={value.displaySettings![t.key]}
                  onCheckedChange={(v) =>
                    onChange({ ...value, displaySettings: { ...value.displaySettings!, [t.key]: Boolean(v) } as DisplaySettings })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
