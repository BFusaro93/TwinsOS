"use client";

import { useState } from "react";
import { Star, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  useInvoicePDFTemplates,
  useCreateInvoicePDFTemplate,
  useSetDefaultInvoicePDFTemplate,
  useDeleteInvoicePDFTemplate,
} from "@/lib/hooks/use-invoice-pdf-templates";
import type { InvoicePDFLayoutKey } from "@/types/crm-invoices";

// Add an entry here when a new layoutKey is implemented in InvoiceDocument.tsx
// (e.g. after importing a customer's own Service Autopilot-style template).
const LAYOUT_OPTIONS: { value: InvoicePDFLayoutKey; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "compact", label: "Compact" },
];

export function InvoiceTemplatesEditor() {
  const { data: templates = [], isLoading } = useInvoicePDFTemplates();
  const create = useCreateInvoicePDFTemplate();
  const setDefault = useSetDefaultInvoicePDFTemplate();
  const del = useDeleteInvoicePDFTemplate();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [layoutKey, setLayoutKey] = useState<InvoicePDFLayoutKey>("default");

  function commitAdd() {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), layoutKey },
      {
        onSuccess: () => { setName(""); setLayoutKey("default"); setAdding(false); toast.success("Template created"); },
        onError: () => toast.error("Failed to create template"),
      }
    );
  }

  function handleSetDefault(id: string) {
    setDefault.mutate(id, { onError: () => toast.error("Failed to set default template") });
  }

  function handleDelete(id: string, isDefault: boolean) {
    if (isDefault) { toast.error("Set a different template as default before deleting this one."); return; }
    if (!window.confirm("Delete this template? Invoices using it will fall back to the org default.")) return;
    del.mutate(id, { onError: () => toast.error("Failed to delete template") });
  }

  return (
    <div className="divide-y">
      {isLoading && <p className="py-3 text-xs text-slate-400">Loading templates…</p>}
      {!isLoading && templates.length === 0 && !adding && (
        <p className="py-3 text-xs text-slate-400">No templates yet — the default PDF layout is used.</p>
      )}
      {templates.map((t) => (
        <div key={t.id} className="flex items-center gap-3 py-2.5">
          <span className="flex-1 text-sm text-slate-800">{t.name}</span>
          <span className="text-xs text-slate-400">{LAYOUT_OPTIONS.find((o) => o.value === t.layoutKey)?.label ?? t.layoutKey}</span>
          <button
            type="button"
            title={t.isDefault ? "Default template" : "Set as default"}
            onClick={() => !t.isDefault && handleSetDefault(t.id)}
            className={t.isDefault ? "text-amber-400" : "text-slate-300 hover:text-amber-400 transition-colors"}
          >
            <Star className="h-4 w-4" fill={t.isDefault ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(t.id, t.isDefault)}
            className="rounded p-1 text-slate-300 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-2 py-2.5">
          <input
            autoFocus
            placeholder="e.g. Standard Invoice"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") { setAdding(false); setName(""); }
            }}
            className="flex-1 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <Select value={layoutKey} onValueChange={(v) => setLayoutKey(v as InvoicePDFLayoutKey)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button onClick={commitAdd} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">
            Add
          </button>
          <button onClick={() => { setAdding(false); setName(""); }} className="rounded p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="py-3">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            + Add Template
          </Button>
        </div>
      )}

      <p className="pt-3 text-xs text-slate-400">
        The starred template is used for all invoices by default. Choose a format when adding a
        template — additional formats can be added here once designed.
      </p>
    </div>
  );
}
