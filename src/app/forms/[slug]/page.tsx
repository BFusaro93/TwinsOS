"use client";

import { use, useEffect, useState } from "react";
import { BrandMark } from "@/components/shared/BrandMark";
import { TurnstileWidget } from "@/components/shared/TurnstileWidget";
import { createClient } from "@/lib/supabase/client";

// Unset in most environments — see .env.local.example. When unset, no widget
// renders and no token is required, so existing forms are unaffected.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormField {
  id: string;
  fieldType: string;
  label: string;
  placeholder: string | null;
  description: string | null;
  required: boolean;
  pageNumber: number;
  options: string[] | null;
  config: Record<string, unknown>;
}

interface FormRule {
  id: string;
  sourceFieldId: string | null;
  operator: string;
  operand: string | null;
  action: string;
  actionValue: string | null;
}

interface PublicForm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown>;
  fields: FormField[];
  rules: FormRule[];
}

interface AttachmentValue {
  path: string;
  name: string;
  size: number;
}

type PageState = "loading" | "not_found" | "ready" | "submitting" | "success" | "error";

const MULTI_VALUE_TYPES = ["checklist"];
// "hidden" is not user-facing and is excluded from validation like the other
// display-only types, but unlike them it DOES carry a value — its configured
// defaultValue — that must still be included in the submitted data.
const DISPLAY_TYPES = ["header", "paragraph", "divider", "hidden"];

// Mirrors the form-attachments Storage bucket's own limits (20260806000006) —
// checked client-side too so a bad file is rejected before attempting an
// upload that Storage would reject anyway.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

function ruleConditionMatches(value: string, operator: string, operand: string | null): boolean {
  const v = value ?? "";
  const op = operand ?? "";
  switch (operator) {
    case "equals":       return v === op;
    case "not_equals":   return v !== op;
    case "greater_than": return parseFloat(v) > parseFloat(op);
    case "less_than":    return parseFloat(v) < parseFloat(op);
    case "contains":     return v.toLowerCase().includes(op.toLowerCase());
    case "is_empty":     return v.trim() === "";
    case "is_not_empty": return v.trim() !== "";
    default:              return false;
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [form, setForm] = useState<PublicForm | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [attachments, setAttachments] = useState<Record<string, AttachmentValue>>({});
  const [attachmentUploading, setAttachmentUploading] = useState<Record<string, boolean>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [hiddenFieldIds, setHiddenFieldIds] = useState<Set<string>>(new Set());
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  useEffect(() => {
    fetch(`/api/public/forms/${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) { setState("not_found"); return; }
        setForm(data);
        setState("ready");
      })
      .catch(() => setState("not_found"));
  }, [slug]);

  const totalPages = form
    ? Math.max(1, ...form.fields.map((f) => f.pageNumber ?? 1))
    : 1;

  const pageFields = form
    ? form.fields.filter((f) => (f.pageNumber ?? 1) === currentPage && !hiddenFieldIds.has(f.id))
    : [];

  /** "page"-type rule evaluation — this project's Rules tab only ever creates
   *  page rules (fired at Next/Back/Submit, not on every keystroke). Recomputes
   *  from the full current answer set every time, so going back and changing
   *  an earlier answer is reflected correctly rather than accumulating stale state. */
  function evaluateRules(defaultNextPage: number) {
    let targetPage = defaultNextPage;
    const hidden = new Set<string>();
    const tagsToAdd = new Set<string>();
    const tagsToRemove = new Set<string>();

    for (const rule of form?.rules ?? []) {
      if (!rule.sourceFieldId) continue;
      const raw = (multiValues[rule.sourceFieldId] ?? []).length > 0
        ? multiValues[rule.sourceFieldId].join(",")
        : values[rule.sourceFieldId] ?? "";
      if (!ruleConditionMatches(raw, rule.operator, rule.operand)) continue;

      switch (rule.action) {
        case "jump_to_page": {
          const p = parseInt(rule.actionValue ?? "", 10);
          if (p) targetPage = p;
          break;
        }
        case "hide_field":
          if (rule.actionValue) hidden.add(rule.actionValue);
          break;
        case "show_field":
          if (rule.actionValue) hidden.delete(rule.actionValue);
          break;
        case "add_tag":
          if (rule.actionValue) tagsToAdd.add(rule.actionValue);
          break;
        case "remove_tag":
          if (rule.actionValue) tagsToRemove.add(rule.actionValue);
          break;
      }
    }
    return { targetPage: Math.min(Math.max(targetPage, 1), totalPages), hidden, tagsToAdd, tagsToRemove };
  }

  // Compute the initial hidden-field set as soon as the form loads, so page 1
  // already reflects any rule whose condition is met by default field values
  // (e.g. a checkbox defaulting to checked).
  useEffect(() => {
    if (!form) return;
    setHiddenFieldIds(evaluateRules(currentPage).hidden);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  function setValue(id: string, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
    if (errors[id]) setErrors((prev) => { const e = { ...prev }; delete e[id]; return e; });
  }

  function toggleMultiValue(id: string, option: string) {
    setMultiValues((prev) => {
      const current = prev[id] ?? [];
      const next = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      return { ...prev, [id]: next };
    });
    if (errors[id]) setErrors((prev) => { const e = { ...prev }; delete e[id]; return e; });
  }

  async function handleAttachmentSelect(fieldId: string, file: File | null) {
    setAttachmentErrors((prev) => { const e = { ...prev }; delete e[fieldId]; return e; });
    if (!file || !form) return;

    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachmentErrors((prev) => ({ ...prev, [fieldId]: "File is too large (max 15 MB)." }));
      return;
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
      setAttachmentErrors((prev) => ({ ...prev, [fieldId]: "Unsupported file type — images and PDFs only." }));
      return;
    }

    setAttachmentUploading((prev) => ({ ...prev, [fieldId]: true }));
    try {
      const supabase = createClient();
      const path = `${form.id}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("form-attachments").upload(path, file, { upsert: false });
      if (error) throw error;
      setAttachments((prev) => ({ ...prev, [fieldId]: { path, name: file.name, size: file.size } }));
      if (errors[fieldId]) setErrors((prev) => { const e = { ...prev }; delete e[fieldId]; return e; });
    } catch (err) {
      setAttachmentErrors((prev) => ({ ...prev, [fieldId]: err instanceof Error ? err.message : "Upload failed" }));
    } finally {
      setAttachmentUploading((prev) => ({ ...prev, [fieldId]: false }));
    }
  }

  function validatePage(fieldsToValidate: FormField[]): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      if (DISPLAY_TYPES.includes(field.fieldType)) continue;
      if (!field.required) continue;

      if (MULTI_VALUE_TYPES.includes(field.fieldType)) {
        if ((multiValues[field.id] ?? []).length === 0) {
          newErrors[field.id] = `${field.label || "This field"} is required`;
        }
      } else if (field.fieldType === "attachment") {
        if (!attachments[field.id]) {
          newErrors[field.id] = `${field.label || "This field"} is required`;
        }
      } else {
        if (!values[field.id]?.trim()) {
          newErrors[field.id] = `${field.label || "This field"} is required`;
        }
      }

      if (field.fieldType === "email" && values[field.id]) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[field.id])) {
          newErrors[field.id] = "Please enter a valid email address";
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleNext() {
    if (!validatePage(pageFields)) return;
    setErrors({});
    const { targetPage, hidden } = evaluateRules(Math.min(currentPage + 1, totalPages));
    setHiddenFieldIds(hidden);
    setCurrentPage(targetPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setErrors({});
    const { hidden } = evaluateRules(Math.max(currentPage - 1, 1));
    setHiddenFieldIds(hidden);
    setCurrentPage((p) => Math.max(p - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePage(pageFields)) return;
    if (!form) return;
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setSubmitError("Please complete the verification check before submitting.");
      return;
    }
    setState("submitting");
    setSubmitError("");

    // Re-evaluate against the final answers so a rule change made without
    // another Next/Back click (e.g. editing the last page right before
    // submitting) is still reflected in what gets excluded/tagged.
    const { hidden: finalHidden, tagsToAdd, tagsToRemove } = evaluateRules(currentPage);

    const data: Record<string, unknown> = {};
    for (const field of form.fields) {
      if (finalHidden.has(field.id)) continue; // rule-hidden fields don't submit a value
      if (field.fieldType === "hidden") {
        data[field.label || field.id] = (field.config?.defaultValue as string | undefined) ?? "";
        continue;
      }
      if (DISPLAY_TYPES.includes(field.fieldType)) continue;
      const key = field.label || field.id;
      if (field.fieldType === "attachment") {
        data[key] = attachments[field.id] ?? null;
      } else if (MULTI_VALUE_TYPES.includes(field.fieldType)) {
        data[key] = multiValues[field.id] ?? [];
      } else {
        data[key] = values[field.id] ?? "";
      }
    }

    // Handle redirect confirmation
    const confirmationType = form.settings.confirmationType as string | undefined;
    const confirmationUrl = form.settings.confirmationUrl as string | undefined;

    try {
      const res = await fetch(`/api/public/forms/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          referer: typeof window !== "undefined" ? window.location.href : undefined,
          ruleTags: { add: [...tagsToAdd], remove: [...tagsToRemove] },
          turnstileToken,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Submission failed");
      }

      if (confirmationType === "url" && confirmationUrl) {
        window.location.href = confirmationUrl;
        return;
      }

      setState("success");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
      // A Turnstile token is single-use — force a fresh solve on retry.
      setTurnstileToken(null);
      setTurnstileKey((k) => k + 1);
    }
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (state === "loading") {
    return (
      <Shell>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="h-4 bg-slate-100 rounded w-80" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      </Shell>
    );
  }

  if (state === "not_found" || !form) {
    return (
      <Shell>
        <div className="text-center py-12">
          <p className="text-2xl font-bold text-slate-700 mb-2">Form not found</p>
          <p className="text-slate-400 text-sm">This form may no longer be available.</p>
        </div>
      </Shell>
    );
  }

  if (state === "success") {
    const successMsg =
      (form.settings.confirmationMessage as string) ??
      (form.settings.successMessage as string) ??
      "Thank you! Your response has been submitted. We'll be in touch shortly.";
    return (
      <Shell formName={form.name}>
        <div className="text-center py-12">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-xl font-semibold text-slate-800 mb-2">Submitted!</p>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">{successMsg}</p>
        </div>
      </Shell>
    );
  }

  const isLastPage = currentPage === totalPages;

  return (
    <Shell formName={form.name} description={form.description ?? undefined}>
      {/* Page progress indicator */}
      {totalPages > 1 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-400">Page {currentPage} of {totalPages}</span>
            <span className="text-xs text-slate-400">
              {Math.round((currentPage / totalPages) * 100)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-brand-600 transition-all duration-300"
              style={{ width: `${(currentPage / totalPages) * 100}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {pageFields.map((field) => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id] ?? ""}
            multiValue={multiValues[field.id] ?? []}
            error={errors[field.id]}
            onChange={(v) => setValue(field.id, v)}
            onToggleMulti={(opt) => toggleMultiValue(field.id, opt)}
            attachment={attachments[field.id] ?? null}
            attachmentUploading={attachmentUploading[field.id] ?? false}
            attachmentError={attachmentErrors[field.id]}
            onAttachmentSelect={(file) => handleAttachmentSelect(field.id, file)}
          />
        ))}

        {isLastPage && TURNSTILE_SITE_KEY && (
          <TurnstileWidget
            key={turnstileKey}
            siteKey={TURNSTILE_SITE_KEY}
            onVerify={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />
        )}

        {submitError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {submitError}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          {currentPage > 1 && (
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ← Back
            </button>
          )}
          {isLastPage ? (
            <button
              type="submit"
              disabled={state === "submitting" || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
              className="flex-1 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {state === "submitting"
                ? "Submitting…"
                : ((form.settings.submitLabel as string) ?? "Submit")}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </form>
    </Shell>
  );
}

// ── FieldRenderer ─────────────────────────────────────────────────────────────

function FieldRenderer({
  field, value, multiValue, error, onChange, onToggleMulti,
  attachment, attachmentUploading, attachmentError, onAttachmentSelect,
}: {
  field: FormField;
  value: string;
  multiValue: string[];
  error?: string;
  onChange: (v: string) => void;
  onToggleMulti: (opt: string) => void;
  attachment: AttachmentValue | null;
  attachmentUploading: boolean;
  attachmentError?: string;
  onAttachmentSelect: (file: File | null) => void;
}) {
  const inputBase =
    "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm " +
    "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder-slate-400";
  const errorBorder = "border-red-400 focus:ring-red-400 focus:border-red-400";

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

  const fieldLabel = (
    <>
      <label className="block text-sm font-medium text-slate-700">
        {field.label}
        {field.required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {field.description && (
        <p className="mt-0.5 text-xs text-slate-500">{field.description}</p>
      )}
    </>
  );

  if (field.fieldType === "textarea") {
    return (
      <div>
        {fieldLabel}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? undefined}
          required={field.required}
          rows={4}
          className={`${inputBase} resize-y ${error ? errorBorder : ""}`}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "select") {
    return (
      <div>
        {fieldLabel}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className={`${inputBase} ${error ? errorBorder : ""}`}
        >
          <option value="">Select an option…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "checkbox") {
    return (
      <div>
        <div className="flex items-start gap-2 mt-1">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "false")}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <label className="text-sm text-slate-700">
            {field.label}
            {field.required && <span className="ml-0.5 text-red-500">*</span>}
          </label>
        </div>
        {field.description && <p className="mt-0.5 ml-6 text-xs text-slate-500">{field.description}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (field.fieldType === "multiple_choice") {
    return (
      <div>
        {fieldLabel}
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
        {fieldLabel}
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
    const labelMin = (field.config.labelMin as string) ?? `0 = Worst`;
    const labelMax = (field.config.labelMax as string) ?? `${max} = Best`;
    const selected = value !== "" ? Number(value) : null;
    return (
      <div>
        {fieldLabel}
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
        {fieldLabel}
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
                <span className={starNum <= selected ? "text-amber-400" : "text-slate-300"}>
                  ★
                </span>
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
            {/* target="_blank" — this form is commonly embedded in an
                iframe (e.g. on a WordPress contact page), so a same-tab
                link here would navigate the iframe away from the form. */}
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

  if (field.fieldType === "attachment") {
    return (
      <div>
        {fieldLabel}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          disabled={attachmentUploading}
          onChange={(e) => onAttachmentSelect(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100 cursor-pointer disabled:opacity-60"
        />
        {attachmentUploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
        {attachment && !attachmentUploading && (
          <p className="mt-1 text-xs text-emerald-600">
            ✓ {attachment.name} ({Math.round(attachment.size / 1024)} KB)
          </p>
        )}
        {attachmentError && <p className="mt-1 text-xs text-red-600">{attachmentError}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {fieldLabel}
      <input
        type={
          field.fieldType === "email" ? "email" :
          field.fieldType === "phone" ? "tel" :
          field.fieldType === "date"  ? "date" :
          field.fieldType === "number" ? "number" :
          "text"
        }
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? undefined}
        required={field.required}
        className={`${inputBase} ${error ? errorBorder : ""}`}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

function Shell({
  children,
  formName,
  description,
}: {
  children: React.ReactNode;
  formName?: string;
  description?: string;
}) {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex items-center gap-2">
          <BrandMark variant="color" className="h-8 w-8 rounded-md" />
        </div>
        <div className="rounded-xl border bg-white p-8 shadow-sm">
          {formName && (
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-900">{formName}</h1>
              {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
            </div>
          )}
          {children}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">Powered by Landscapt</p>
      </div>
    </div>
  );
}
