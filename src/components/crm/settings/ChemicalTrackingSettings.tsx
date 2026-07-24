"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Star, Trash2, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  useChemicalSettings,
  useUpdateChemicalSettings,
  useChemicalLookupItems,
  useCreateChemicalLookupItem,
  useUpdateChemicalLookupItem,
} from "@/lib/hooks/use-chemical-tracking";
import { useCustomFieldDefs } from "@/lib/hooks/use-rate-matrix";
import {
  useEmailTemplates,
  useUpsertEmailTemplate,
  useDeleteEmailTemplate,
} from "@/lib/hooks/use-email-templates";
import { CHEMICAL_EMAIL_MERGE_TAGS } from "@/types/crm-proposals";
import type { CRMEmailTemplate } from "@/types/crm-proposals";
import type { ChemicalConditionsDisplay, ChemicalLookupType } from "@/types/chemical-tracking";

function Section({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-slate-50"
      >
        <div>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}

function GeneralChemicalSettings() {
  const { data: settings } = useChemicalSettings();
  const update = useUpdateChemicalSettings();
  const { data: propertyFieldDefs = [] } = useCustomFieldDefs("property");
  const numericFieldDefs = propertyFieldDefs.filter((d) => d.fieldType === "number");

  function handleConditionsChange(v: ChemicalConditionsDisplay) {
    update.mutate(
      { conditionsDisplay: v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
      }
    );
  }

  function handleAutoCalcChange(v: boolean) {
    update.mutate(
      { autoCalcQuantity: v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
      }
    );
  }

  function handleAreaFieldChange(v: string) {
    update.mutate(
      { areaCustomFieldId: v === "none" ? null : v },
      {
        onSuccess: () => toast.success("Saved"),
        onError: (err) => toast.error(`Failed to save: ${(err as Error).message}`),
      }
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1.5 max-w-xs">
        <Label className="text-xs">Conditions Shown on Applications</Label>
        <Select
          value={settings?.conditionsDisplay ?? "weather"}
          onValueChange={(v) => handleConditionsChange(v as ChemicalConditionsDisplay)}
        >
          <SelectTrigger className="text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weather">Weather Conditions (temp, wind)</SelectItem>
            <SelectItem value="ph">pH Level</SelectItem>
            <SelectItem value="both">Both</SelectItem>
            <SelectItem value="neither">Neither</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label className="flex max-w-xs items-center justify-between gap-3 rounded-md border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-slate-800">Default Chemical Quantity</p>
          <p className="text-xs text-slate-500">
            Auto-calculate quantity to apply from a property&apos;s custom field and the product&apos;s
            application rate.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={settings?.autoCalcQuantity ?? false}
          onClick={() => handleAutoCalcChange(!(settings?.autoCalcQuantity ?? false))}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
            settings?.autoCalcQuantity ? "bg-brand-500" : "bg-slate-200"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              settings?.autoCalcQuantity ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </label>

      {settings?.autoCalcQuantity && (
        <div className="flex flex-col gap-1.5 max-w-xs">
          <Label className="text-xs">Area Custom Field</Label>
          <Select value={settings?.areaCustomFieldId ?? "none"} onValueChange={handleAreaFieldChange}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select a property field…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None —</SelectItem>
              {numericFieldDefs.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500">
            The numeric property field (e.g. Turf Sq Ft) used to auto-calculate quantity from each
            product&apos;s application rate.
          </p>
        </div>
      )}
    </div>
  );
}

// Sensible starting points for lists that have well-known standard units —
// seeded once when an org first opens Chemical Tracking settings with an
// empty list. Other lookup types (e.g. Areas Treated) are site-specific and
// have no universal defaults, so they're left for the user to define.
// Matches Service Autopilot's Units of Measure list (liquid + weight + metric).
const DEFAULT_LOOKUP_ITEMS: Partial<Record<ChemicalLookupType, string[]>> = {
  volume_unit: [
    "Cups", "Gallons", "Grams", "Kilograms", "Liters", "Milliliters",
    "Ounces - Liquid", "Ounces - Weight", "Pints", "Pounds", "Quarts",
    "Tablespoons", "Teaspoons",
  ],
  // Square Foot and 1,000 Sq Ft kept adjacent (a lawn-chemical rate is almost
  // always expressed as one or the other) with Acre last, rather than
  // alphabetical order which splits them apart.
  area_unit: ["Square Foot", "1,000 Sq Ft", "Acre"],
};

function LookupListEditor({ listType, addPlaceholder }: { listType: ChemicalLookupType; addPlaceholder: string }) {
  const { data: items = [], isLoading } = useChemicalLookupItems(listType);
  const create = useCreateChemicalLookupItem();
  const update = useUpdateChemicalLookupItem();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const seededRef = useRef(false);

  useEffect(() => {
    const defaults = DEFAULT_LOOKUP_ITEMS[listType];
    if (!defaults || isLoading || seededRef.current || items.length > 0) return;
    seededRef.current = true;
    (async () => {
      for (let i = 0; i < defaults.length; i++) {
        const created = await create.mutateAsync({ listType, name: defaults[i] });
        await update.mutateAsync({ id: created.id, sortOrder: i });
      }
    })();
  }, [listType, isLoading, items.length, create, update]);

  function commitAdd() {
    if (!newName.trim()) return;
    create.mutate(
      { listType, name: newName.trim() },
      { onSuccess: () => { setNewName(""); setAdding(false); } }
    );
  }

  return (
    <div className="divide-y">
      {items.length === 0 && !adding && (
        <p className="py-3 text-xs text-slate-400">No items yet.</p>
      )}
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-2.5">
          <span className="flex-1 text-sm text-slate-800">{item.name}</span>
          <button
            role="switch"
            aria-checked={item.isActive}
            onClick={() => update.mutate({ id: item.id, isActive: !item.isActive })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
              item.isActive ? "bg-brand-500" : "bg-slate-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                item.isActive ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-3 py-2.5">
          <input
            autoFocus
            placeholder={addPlaceholder}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") { setAdding(false); setNewName(""); }
            }}
            className="flex-1 rounded-md border border-brand-400 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <button onClick={commitAdd} className="rounded-md bg-brand-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-600">
            Add
          </button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="rounded p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="py-3">
          <button onClick={() => setAdding(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            + Add item
          </button>
        </div>
      )}
    </div>
  );
}

// ── Client Notice Email templates ────────────────────────────────────────────

type NoticeFormState = {
  id?: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault: boolean;
};

const EMPTY_NOTICE_FORM: NoticeFormState = { name: "", subject: "", bodyHtml: "", isDefault: false };

function NoticeEmailTemplatesEditor() {
  const { data: templates = [], isLoading } = useEmailTemplates("chemical_application");
  const upsert = useUpsertEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<NoticeFormState>(EMPTY_NOTICE_FORM);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function openNew() {
    setForm(EMPTY_NOTICE_FORM);
    setFormOpen(true);
  }

  function openEdit(t: CRMEmailTemplate) {
    setForm({ id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, isDefault: t.isDefault });
    setFormOpen(true);
  }

  function cancel() {
    setForm(EMPTY_NOTICE_FORM);
    setFormOpen(false);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Name is required."); return; }
    if (!form.subject.trim()) { toast.error("Subject is required."); return; }
    try {
      await upsert.mutateAsync({
        id: form.id,
        name: form.name,
        subject: form.subject,
        bodyHtml: form.bodyHtml,
        isDefault: form.isDefault,
        templateType: "chemical_application",
      });
      toast.success(form.id ? "Template updated." : "Template created.");
      cancel();
    } catch {
      toast.error("Failed to save template.");
    }
  }

  async function handleDelete(t: CRMEmailTemplate) {
    if (!window.confirm(`Delete "${t.name}"? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(t.id);
      toast.success("Template deleted.");
      if (form.id === t.id) cancel();
    } catch {
      toast.error("Failed to delete template.");
    }
  }

  async function markDefault(t: CRMEmailTemplate) {
    try {
      await upsert.mutateAsync({
        id: t.id, name: t.name, subject: t.subject, bodyHtml: t.bodyHtml,
        isDefault: true, templateType: "chemical_application",
      });
      toast.success(`"${t.name}" set as default.`);
    } catch {
      toast.error("Failed to update default.");
    }
  }

  function insertMergeTag(tag: string) {
    const ta = bodyRef.current;
    if (!ta) { setForm((f) => ({ ...f, bodyHtml: f.bodyHtml + tag })); return; }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const next = ta.value.slice(0, start) + tag + ta.value.slice(end);
    setForm((f) => ({ ...f, bodyHtml: next }));
    requestAnimationFrame(() => {
      ta.selectionStart = start + tag.length;
      ta.selectionEnd = start + tag.length;
      ta.focus();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Sent to the client after a chemical application is logged (mirrors the paper notice
          left on-site).
        </p>
        {!formOpen && (
          <Button size="sm" onClick={openNew}>New Template</Button>
        )}
      </div>

      {formOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {form.id ? "Edit Template" : "New Template"}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ce-name">Name</Label>
              <Input
                id="ce-name"
                placeholder="e.g. Application Notice"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ce-subject">Subject</Label>
              <Input
                id="ce-subject"
                placeholder="e.g. Notice of Treatment from [companyname]"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ce-body">Body (HTML supported)</Label>
            <textarea
              id="ce-body"
              ref={bodyRef}
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="<p>Hi [clientfirstname],</p>"
              value={form.bodyHtml}
              onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-slate-400 self-center">Insert:</span>
              {CHEMICAL_EMAIL_MERGE_TAGS.map(({ tag, label }) => (
                <button
                  key={tag}
                  type="button"
                  title={label}
                  onClick={() => insertMergeTag(tag)}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-200 transition-colors font-mono"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="ce-default"
              checked={form.isDefault}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: !!v }))}
            />
            <Label htmlFor="ce-default" className="cursor-pointer">Set as default template</Label>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-400">Loading templates…</p>}

      {!isLoading && templates.length === 0 && !formOpen && (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">
            No email templates yet. Create one to use when sending application notices.
          </p>
        </div>
      )}

      {!isLoading && templates.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Subject</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {templates.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{t.name}</td>
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell max-w-xs truncate">{t.subject}</td>
                  <td className="px-4 py-3">
                    {t.isDefault ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Default</Badge>
                    ) : (
                      <button
                        type="button"
                        title="Set as default"
                        onClick={() => markDefault(t)}
                        className="text-slate-300 hover:text-amber-400 transition-colors"
                      >
                        <Star className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600"
                        onClick={() => handleDelete(t)} title="Delete" disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ChemicalTrackingTab() {
  return (
    <div className="rounded-lg border bg-white shadow-sm">
      <Section title="General Chemical Settings" defaultOpen>
        <GeneralChemicalSettings />
      </Section>
      <Section title="Application Methods" description="How chemicals are applied — e.g. Broadcast, Backpack Sprayer, Truck Tank">
        <LookupListEditor listType="application_method" addPlaceholder="e.g. Backpack Sprayer" />
      </Section>
      <Section title="Targets" description="What the chemical treats — pests, weeds, etc.">
        <LookupListEditor listType="target" addPlaceholder="e.g. Grubs" />
      </Section>
      <Section title="Volume Units" description="Units for measuring chemical volume — ounces, gallons, pounds">
        <LookupListEditor listType="volume_unit" addPlaceholder="e.g. Fluid Ounces" />
      </Section>
      <Section title="Area Units" description="Units for measuring the size of the treated area">
        <LookupListEditor listType="area_unit" addPlaceholder="e.g. 1,000 sq ft" />
      </Section>
      <Section title="Areas Treated" description="Named property zones that can be treated — front lawn, back lawn, etc.">
        <LookupListEditor listType="areas_treated" addPlaceholder="e.g. Front Turf" />
      </Section>
      <Section title="Client Notice Email" description="Sent to clients after a chemical application is logged">
        <NoticeEmailTemplatesEditor />
      </Section>
    </div>
  );
}
