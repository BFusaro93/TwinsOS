"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2, Plus, Star } from "lucide-react";
import {
  useEmailTemplates,
  useUpsertEmailTemplate,
  useDeleteEmailTemplate,
} from "@/lib/hooks/use-email-templates";
import type { CRMEmailTemplate } from "@/types/crm-proposals";

type FormState = {
  id?: string;
  name: string;
  subject: string;
  bodyHtml: string;
  isDefault: boolean;
  includePdf: boolean;
};

const EMPTY_FORM: FormState = {
  id: undefined,
  name: "",
  subject: "",
  bodyHtml: "",
  isDefault: false,
  includePdf: true,
};

interface EmailTemplatesEditorProps {
  templateType: CRMEmailTemplate["templateType"];
  description: string;
  mergeTags: readonly { tag: string; label: string }[];
  emptyMessage: string;
}

// Generic email-template CRUD editor — parametrized by entity type so it can
// back both estimate and invoice "Documents"-style default/dropdown template
// pickers (SendEstimateDialog / InvoiceEmailDialog) from one implementation.
export function EmailTemplatesEditor({ templateType, description, mergeTags, emptyMessage }: EmailTemplatesEditorProps) {
  const { data: templates = [], isLoading } = useEmailTemplates(templateType);
  const upsert = useUpsertEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function openNew() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(t: CRMEmailTemplate) {
    setForm({
      id: t.id,
      name: t.name,
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      isDefault: t.isDefault,
      includePdf: t.includePdf,
    });
    setFormOpen(true);
  }

  function cancel() {
    setForm(EMPTY_FORM);
    setFormOpen(false);
  }

  async function save() {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!form.subject.trim()) {
      toast.error("Subject is required.");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: form.id,
        name: form.name,
        subject: form.subject,
        bodyHtml: form.bodyHtml,
        isDefault: form.isDefault,
        includePdf: form.includePdf,
        templateType,
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
        id: t.id,
        name: t.name,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        isDefault: true,
        includePdf: t.includePdf,
        templateType,
      });
      toast.success(`"${t.name}" set as default.`);
    } catch {
      toast.error("Failed to update default.");
    }
  }

  function insertMergeTag(tag: string) {
    const ta = bodyRef.current;
    if (!ta) {
      setForm((f) => ({ ...f, bodyHtml: f.bodyHtml + tag }));
      return;
    }
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
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">{description}</p>
        {!formOpen && (
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            New Template
          </Button>
        )}
      </div>

      {/* Inline form */}
      {formOpen && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-slate-800">
            {form.id ? "Edit Template" : "New Template"}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="et-name">Name</Label>
              <Input
                id="et-name"
                placeholder="e.g. Initial Estimate Email"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="et-subject">Subject</Label>
              <Input
                id="et-subject"
                placeholder="e.g. Your estimate from [companyname]"
                value={form.subject}
                onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="et-body">Body (HTML supported)</Label>
            <textarea
              id="et-body"
              ref={bodyRef}
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="<p>Hi [clientfirstname],</p>"
              value={form.bodyHtml}
              onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              <span className="text-xs text-slate-400 self-center">Insert:</span>
              {mergeTags.map(({ tag, label }) => (
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
              id="et-default"
              checked={form.isDefault}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isDefault: !!v }))}
            />
            <Label htmlFor="et-default" className="cursor-pointer">
              Set as default template
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="et-include-pdf"
              checked={form.includePdf}
              onCheckedChange={(v) => setForm((f) => ({ ...f, includePdf: !!v }))}
            />
            <Label htmlFor="et-include-pdf" className="cursor-pointer">
              Attach PDF when sending
            </Label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={save} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Template list */}
      {isLoading && (
        <p className="text-sm text-slate-400">Loading templates…</p>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">{emptyMessage}</p>
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
                  <td className="px-4 py-3 text-slate-500 hidden sm:table-cell max-w-xs truncate">
                    {t.subject}
                  </td>
                  <td className="px-4 py-3">
                    {t.isDefault ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                        Default
                      </Badge>
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
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => openEdit(t)}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-400 hover:text-red-600"
                        onClick={() => handleDelete(t)}
                        title="Delete"
                        disabled={deleteMutation.isPending}
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
