"use client";

import { useState } from "react";
import { Star, Trash2, X, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  useUpdateInvoicePDFTemplate,
  useSetDefaultInvoicePDFTemplate,
  useDeleteInvoicePDFTemplate,
} from "@/lib/hooks/use-invoice-pdf-templates";
import type { InvoicePDFLayoutKey, InvoicePDFTemplate } from "@/types/crm-invoices";

// Add an entry here when a new layoutKey is implemented in InvoiceDocument.tsx
// (e.g. after importing a customer's own Service Autopilot-style template).
const LAYOUT_OPTIONS: { value: InvoicePDFLayoutKey; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "compact", label: "Compact" },
  { value: "statement", label: "Statement (running account balance + payment stub)" },
  { value: "statement_invoice_only", label: "Statement (this invoice's balance only + payment stub)" },
];

function TemplateEditPanel({ template, onClose }: { template: InvoicePDFTemplate; onClose: () => void }) {
  const update = useUpdateInvoicePDFTemplate();
  const [layoutKey, setLayoutKey] = useState(template.layoutKey);
  const [logoUrl, setLogoUrl] = useState(template.logoUrl ?? "");
  const [accentColor, setAccentColor] = useState(template.accentColor ?? "#60ab45");
  const [showNotes, setShowNotes] = useState(template.showNotes);
  const [defaultNotes, setDefaultNotes] = useState(template.defaultNotes ?? "");
  const [advertisementText, setAdvertisementText] = useState(template.advertisementText ?? "");

  function handleSave() {
    update.mutate(
      {
        id: template.id,
        layoutKey,
        logoUrl: logoUrl.trim() || null,
        accentColor: accentColor.trim() || null,
        showNotes,
        defaultNotes: defaultNotes.trim() || null,
        advertisementText: advertisementText.trim() || null,
      },
      {
        onSuccess: () => { toast.success("Template updated"); onClose(); },
        onError: () => toast.error("Failed to update template"),
      }
    );
  }

  return (
    <div className="space-y-3 rounded-md border bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Layout</label>
          <Select value={layoutKey} onValueChange={(v) => setLayoutKey(v as InvoicePDFLayoutKey)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LAYOUT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Accent Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(accentColor) ? accentColor : "#60ab45"}
              onChange={(e) => setAccentColor(e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded border"
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              placeholder="Uses org brand color"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Logo URL</label>
        <Input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="Uses org logo — paste a hosted image URL to override"
          className="h-8 text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <Checkbox checked={showNotes} onCheckedChange={(v) => setShowNotes(v === true)} />
        Show invoice notes section
      </label>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Default Notes (used when an invoice has none of its own)
        </label>
        <textarea
          value={defaultNotes}
          onChange={(e) => setDefaultNotes(e.target.value)}
          rows={2}
          placeholder={'e.g. "Thank you for your business!"'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Advertisement / Service Update (shown on every invoice using this template)
        </label>
        <textarea
          value={advertisementText}
          onChange={(e) => setAdvertisementText(e.target.value)}
          rows={2}
          placeholder={'e.g. "We now offer junk removal and dumpster rentals!"'}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onClose}>Cancel</Button>
        <a
          href={`/api/crm/invoice-templates/${template.id}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 hover:underline"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview with saved changes
        </a>
      </div>
    </div>
  );
}

export function InvoiceTemplatesEditor() {
  const { data: templates = [], isLoading } = useInvoicePDFTemplates();
  const create = useCreateInvoicePDFTemplate();
  const setDefault = useSetDefaultInvoicePDFTemplate();
  const del = useDeleteInvoicePDFTemplate();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [layoutKey, setLayoutKey] = useState<InvoicePDFLayoutKey>("default");
  const [editingId, setEditingId] = useState<string | null>(null);

  function commitAdd() {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), layoutKey },
      {
        onSuccess: (created) => {
          setName(""); setLayoutKey("default"); setAdding(false);
          toast.success("Template created");
          setEditingId(created.id);
        },
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
        <div key={t.id} className="py-2.5">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-sm text-slate-800">{t.name}</span>
            <span className="text-xs text-slate-400">{LAYOUT_OPTIONS.find((o) => o.value === t.layoutKey)?.label ?? t.layoutKey}</span>
            <a
              href={`/api/crm/invoice-templates/${t.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              title="Preview"
              className="text-slate-300 hover:text-brand-600"
            >
              <Eye className="h-4 w-4" />
            </a>
            <button
              type="button"
              title="Edit template"
              onClick={() => setEditingId(editingId === t.id ? null : t.id)}
              className={editingId === t.id ? "text-brand-600" : "text-slate-300 hover:text-brand-600 transition-colors"}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
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
          {editingId === t.id && (
            <div className="mt-2">
              <TemplateEditPanel template={t} onClose={() => setEditingId(null)} />
            </div>
          )}
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
        The starred template is used for all invoices by default. Click the pencil on any template
        to override its logo, accent color, and whether notes show — or the eye icon to preview it
        with sample data.
      </p>
    </div>
  );
}
