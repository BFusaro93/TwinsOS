"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { CRMForm, CRMFormField } from "@/types/crm-forms";

interface AttachmentValue {
  path: string;
  name: string;
  size: number;
}

// Mirrors the form-attachments Storage bucket's own limits
// (20260806000006_form_attachments_bucket.sql).
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

// Mirrors src/app/forms/[slug]/page.tsx's DISPLAY_TYPES/MULTI_VALUE_TYPES —
// kept in sync deliberately since this dialog previews the same form.
const DISPLAY_TYPES = new Set(["header", "paragraph", "divider", "hidden"]);
const MULTI_VALUE_TYPES = new Set(["checklist"]);

// ── Field renderer (mirrors public form, inline in app) ───────────────────────

function FieldRenderer({
  field,
  value,
  multiValue,
  error,
  onChange,
  onToggleMulti,
  attachment,
  attachmentUploading,
  attachmentError,
  onAttachmentSelect,
}: {
  field: CRMFormField;
  value: string;
  multiValue: string[];
  error?: string;
  onChange: (v: string) => void;
  onToggleMulti: (opt: string) => void;
  attachment?: AttachmentValue;
  attachmentUploading?: boolean;
  attachmentError?: string;
  onAttachmentSelect?: (file: File | null) => void;
}) {
  const base =
    "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder-slate-400";
  const errCls = "border-red-400 focus:ring-red-400 focus:border-red-400";

  if (field.fieldType === "header") {
    return (
      <div>
        <h2 className="text-lg font-bold text-slate-800">{field.label}</h2>
        {field.description && <p className="mt-0.5 text-sm text-slate-500">{field.description}</p>}
      </div>
    );
  }

  if (field.fieldType === "paragraph") {
    return (
      <div>
        {field.label && <p className="text-sm font-medium text-slate-700 mb-0.5">{field.label}</p>}
        <p className="text-sm text-slate-600">{field.description ?? ""}</p>
      </div>
    );
  }

  if (field.fieldType === "divider") {
    return <hr className="border-slate-200" />;
  }

  if (field.fieldType === "hidden") {
    return null;
  }

  if (field.fieldType === "multiple_choice") {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <div className="mt-2 space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="h-4 w-4 border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "checklist") {
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <div className="mt-2 space-y-2">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={multiValue.includes(opt)}
                onChange={() => onToggleMulti(opt)}
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "rating") {
    const max = (field.config.max as number) ?? 5;
    const labelMin = (field.config.labelMin as string) ?? "0 = Worst";
    const labelMax = (field.config.labelMax as string) ?? `${max} = Best`;
    const selected = value !== "" ? Number(value) : null;
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <div className="mt-2">
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: max + 1 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onChange(String(i))}
                className={`flex h-9 w-9 items-center justify-center rounded border text-sm font-semibold transition-colors ${
                  selected === i
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:border-brand-400"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{labelMin}</span>
            <span>{labelMax}</span>
          </div>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "review") {
    const max = (field.config.max as number) ?? 5;
    const selected = value !== "" ? Number(value) : 0;
    return (
      <div>
        <label className="block text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <div className="mt-2 flex gap-1">
          {Array.from({ length: max }).map((_, i) => {
            const starNum = i + 1;
            return (
              <button
                key={starNum}
                type="button"
                onClick={() => onChange(String(starNum))}
                className="text-2xl transition-colors focus:outline-none"
              >
                <span className={starNum <= selected ? "text-amber-400" : "text-slate-300"}>★</span>
              </button>
            );
          })}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "sms_optin") {
    return (
      <div>
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <div>
            <label className="text-sm font-medium text-slate-700">
              {field.label || "SMS Opt-in"}
              {field.required && <span className="ml-0.5 text-red-500">*</span>}
            </label>
            {field.description && (
              <p className="text-xs text-slate-500 mt-0.5">{field.description}</p>
            )}
            <p className="text-xs text-slate-500 mt-0.5">
              See our{" "}
              <a href="/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">
                Privacy Policy
              </a>{" "}
              and{" "}
              <a href="/legal/sms-terms" target="_blank" rel="noopener noreferrer" className="underline">
                SMS Terms &amp; Conditions
              </a>
              .
            </p>
          </div>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {field.fieldType === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          rows={3}
          className={`${base} resize-y ${error ? errCls : ""}`}
        />
      ) : field.fieldType === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${error ? errCls : ""}`}
        >
          <option value="">Select an option…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : field.fieldType === "checkbox" ? (
        <div className="mt-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-slate-600">{field.placeholder ?? field.label}</span>
        </div>
      ) : field.fieldType === "attachment" ? (
        <div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            disabled={attachmentUploading}
            onChange={(e) => onAttachmentSelect?.(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100 cursor-pointer disabled:opacity-60"
          />
          {attachmentUploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
          {attachment && !attachmentUploading && (
            <p className="mt-1 text-xs text-emerald-600">
              ✓ {attachment.name} ({Math.round(attachment.size / 1024)} KB)
            </p>
          )}
          {attachmentError && <p className="mt-1 text-xs text-red-600">{attachmentError}</p>}
        </div>
      ) : (
        <input
          type={
            field.fieldType === "email" ? "email"
            : field.fieldType === "phone" ? "tel"
            : field.fieldType === "date" ? "date"
            : "text"
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          className={`${base} ${error ? errCls : ""}`}
        />
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── FillOutFormDialog ─────────────────────────────────────────────────────────

interface Props {
  form: CRMForm & { fields: CRMFormField[] };
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type State = "idle" | "submitting" | "success";

export function FillOutFormDialog({ form, open, onOpenChange }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Record<string, AttachmentValue>>({});
  const [attachmentUploading, setAttachmentUploading] = useState<Record<string, boolean>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<State>("idle");

  function setValue(label: string, value: string) {
    setValues((prev) => ({ ...prev, [label]: value }));
    if (errors[label]) setErrors((prev) => { const e = { ...prev }; delete e[label]; return e; });
  }

  function toggleMultiValue(label: string, option: string) {
    setMultiValues((prev) => {
      const current = prev[label] ?? [];
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
      return { ...prev, [label]: next };
    });
    if (errors[label]) setErrors((prev) => { const e = { ...prev }; delete e[label]; return e; });
  }

  async function handleAttachmentSelect(label: string, file: File | null) {
    setAttachmentErrors((prev) => { const e = { ...prev }; delete e[label]; return e; });
    if (!file) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentErrors((prev) => ({ ...prev, [label]: "File is too large (max 15 MB)." }));
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      setAttachmentErrors((prev) => ({ ...prev, [label]: "Unsupported file type — images and PDFs only." }));
      return;
    }

    setAttachmentUploading((prev) => ({ ...prev, [label]: true }));
    try {
      const supabase = createClient();
      const path = `${form.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("form-attachments").upload(path, file, { upsert: false });
      if (error) throw error;
      setAttachments((prev) => ({ ...prev, [label]: { path, name: file.name, size: file.size } }));
      if (errors[label]) setErrors((prev) => { const e = { ...prev }; delete e[label]; return e; });
    } catch (err) {
      setAttachmentErrors((prev) => ({ ...prev, [label]: err instanceof Error ? err.message : "Upload failed" }));
    } finally {
      setAttachmentUploading((prev) => ({ ...prev, [label]: false }));
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const field of form.fields) {
      if (DISPLAY_TYPES.has(field.fieldType)) continue;

      if (field.required) {
        if (field.fieldType === "attachment") {
          if (!attachments[field.label]) errs[field.label] = `${field.label} is required`;
        } else if (MULTI_VALUE_TYPES.has(field.fieldType)) {
          if ((multiValues[field.label] ?? []).length === 0) errs[field.label] = `${field.label} is required`;
        } else if (!values[field.label]?.trim()) {
          errs[field.label] = `${field.label} is required`;
        }
      }
      if (field.fieldType === "email" && values[field.label]) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field.label])) {
          errs[field.label] = "Please enter a valid email address";
        }
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setState("submitting");

    const data: Record<string, unknown> = { ...values };
    for (const field of form.fields) {
      if (field.fieldType === "attachment") {
        data[field.label] = attachments[field.label] ?? null;
      } else if (MULTI_VALUE_TYPES.has(field.fieldType)) {
        data[field.label] = multiValues[field.label] ?? [];
      }
    }

    try {
      // Uses the internal test-submit route (not the public one) so this
      // works on a draft/unpublished form — the public route requires
      // status='published' and would always 404 before the form is live.
      const res = await fetch(`/api/crm/forms/${form.id}/test-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Submission failed");
      }

      setState("success");
      toast.success("Form submitted successfully");
    } catch (err) {
      setState("idle");
      toast.error(err instanceof Error ? err.message : "Submission failed");
    }
  }

  function handleClose() {
    // Reset on close
    setValues({});
    setMultiValues({});
    setErrors({});
    setAttachments({});
    setAttachmentUploading({});
    setAttachmentErrors({});
    setState("idle");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.name}</DialogTitle>
          {form.description && (
            <p className="text-sm text-slate-500 mt-0.5">{form.description}</p>
          )}
        </DialogHeader>

        {state === "success" ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-slate-800">Submitted!</p>
            <p className="mt-1 text-sm text-slate-500">Response recorded successfully.</p>
            <Button size="sm" className="mt-4" onClick={() => { setValues({}); setMultiValues({}); setErrors({}); setState("idle"); }}>
              Fill Out Again
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2" noValidate>
            {form.fields.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                No fields yet — add fields in the Builder tab first.
              </p>
            ) : (
              form.fields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={values[field.label] ?? ""}
                  multiValue={multiValues[field.label] ?? []}
                  error={errors[field.label]}
                  onChange={(v) => setValue(field.label, v)}
                  onToggleMulti={(opt) => toggleMultiValue(field.label, opt)}
                  attachment={attachments[field.label]}
                  attachmentUploading={attachmentUploading[field.label] ?? false}
                  attachmentError={attachmentErrors[field.label]}
                  onAttachmentSelect={(file) => handleAttachmentSelect(field.label, file)}
                />
              ))
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={state === "submitting" || form.fields.length === 0}
              >
                {state === "submitting" ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
