"use client";

import { use, useEffect, useState } from "react";
import { Leaf } from "lucide-react";

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

interface PublicForm {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown>;
  fields: FormField[];
}

type PageState = "loading" | "not_found" | "ready" | "submitting" | "success" | "error";

const MULTI_VALUE_TYPES = ["checklist"];
const DISPLAY_TYPES = ["header", "paragraph", "divider", "hidden"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [form, setForm] = useState<PublicForm | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [values, setValues] = useState<Record<string, string>>({});
  const [multiValues, setMultiValues] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

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
    ? form.fields.filter((f) => (f.pageNumber ?? 1) === currentPage)
    : [];

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

  function validatePage(fieldsToValidate: FormField[]): boolean {
    const newErrors: Record<string, string> = {};
    for (const field of fieldsToValidate) {
      if (DISPLAY_TYPES.includes(field.fieldType)) continue;
      if (!field.required) continue;

      if (MULTI_VALUE_TYPES.includes(field.fieldType)) {
        if ((multiValues[field.id] ?? []).length === 0) {
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
    setCurrentPage((p) => Math.min(p + 1, totalPages));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBack() {
    setErrors({});
    setCurrentPage((p) => Math.max(p - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePage(pageFields)) return;
    if (!form) return;
    setState("submitting");
    setSubmitError("");

    const data: Record<string, unknown> = {};
    for (const field of form.fields) {
      if (DISPLAY_TYPES.includes(field.fieldType)) continue;
      const key = field.label || field.id;
      if (MULTI_VALUE_TYPES.includes(field.fieldType)) {
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
          />
        ))}

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
              disabled={state === "submitting"}
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
}: {
  field: FormField;
  value: string;
  multiValue: string[];
  error?: string;
  onChange: (v: string) => void;
  onToggleMulti: (opt: string) => void;
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
          className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
        />
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
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-600">
            <Leaf className="h-4 w-4 text-white" />
          </div>
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
        <p className="mt-6 text-center text-xs text-slate-400">Powered by TwinsOS</p>
      </div>
    </div>
  );
}
