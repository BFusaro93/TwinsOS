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
import type { CRMForm, CRMFormField } from "@/types/crm-forms";

// ── Field renderer (mirrors public form, inline in app) ───────────────────────

function FieldRenderer({
  field,
  value,
  error,
  onChange,
}: {
  field: CRMFormField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const base =
    "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder-slate-400";
  const errCls = "border-red-400 focus:ring-red-400 focus:border-red-400";

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<State>("idle");

  function setValue(label: string, value: string) {
    setValues((prev) => ({ ...prev, [label]: value }));
    if (errors[label]) setErrors((prev) => { const e = { ...prev }; delete e[label]; return e; });
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    for (const field of form.fields) {
      if (field.required && !values[field.label]?.trim()) {
        errs[field.label] = `${field.label} is required`;
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

    try {
      // Uses the internal test-submit route (not the public one) so this
      // works on a draft/unpublished form — the public route requires
      // status='published' and would always 404 before the form is live.
      const res = await fetch(`/api/crm/forms/${form.id}/test-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: values }),
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
    setErrors({});
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
            <Button size="sm" className="mt-4" onClick={() => { setValues({}); setErrors({}); setState("idle"); }}>
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
                  error={errors[field.label]}
                  onChange={(v) => setValue(field.label, v)}
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
