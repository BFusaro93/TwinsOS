"use client";

import { useEffect, useState } from "react";
import {
  useSaveFormFields,
  useFormRules,
  useSaveFormRules,
  useUpdateForm,
} from "@/lib/hooks/use-crm-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Globe,
  Plus,
  Trash2,
  Layers,
  GitBranch,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import type {
  CRMForm,
  CRMFormField,
  FormFieldType,
  FormRuleAction,
  FormRuleOperator,
} from "@/types/crm-forms";

// ── Field type groups ─────────────────────────────────────────────────────────

const FIELD_TYPE_GROUPS: { label: string; types: { value: FormFieldType; label: string }[] }[] = [
  {
    label: "Simple Fields",
    types: [
      { value: "text",     label: "Short Text" },
      { value: "email",    label: "Email" },
      { value: "phone",    label: "Phone" },
      { value: "textarea", label: "Long Text" },
      { value: "number",   label: "Number" },
      { value: "date",     label: "Date / Time" },
      { value: "select",   label: "Dropdown" },
      { value: "checkbox", label: "Checkbox" },
    ],
  },
  {
    label: "Advanced Fields",
    types: [
      { value: "multiple_choice", label: "Multiple Choice" },
      { value: "checklist",       label: "Checklist" },
      { value: "rating",          label: "Rating Scale" },
      { value: "review",          label: "Star Review" },
      { value: "hidden",          label: "Hidden Field" },
      { value: "sms_optin",       label: "SMS Opt-in" },
    ],
  },
  {
    label: "Layout",
    types: [
      { value: "header",    label: "Header" },
      { value: "paragraph", label: "Paragraph" },
      { value: "divider",   label: "Divider" },
    ],
  },
  {
    label: "Widgets",
    types: [
      { value: "attachment", label: "File Attachment" },
    ],
  },
];

// Flat map for display labels
const FIELD_TYPE_LABEL: Record<FormFieldType, string> = Object.fromEntries(
  FIELD_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.value, t.label]))
) as Record<FormFieldType, string>;

const DISPLAY_TYPES: FormFieldType[] = ["header", "paragraph", "divider"];
const OPTIONS_TYPES: FormFieldType[] = ["select", "multiple_choice", "checklist"];
const PLACEHOLDER_TYPES: FormFieldType[] = ["text", "email", "phone", "textarea", "number"];

// ── Mappable CRM fields ───────────────────────────────────────────────────────

const MAPPED_FIELD_OPTIONS: { label: string; value: string }[] = [
  { value: "client.first_name",    label: "Client — First Name" },
  { value: "client.last_name",     label: "Client — Last Name" },
  { value: "client.email",         label: "Client — Email" },
  { value: "client.phone",         label: "Client — Phone" },
  { value: "client.company_name",  label: "Client — Company Name" },
  { value: "client.address_line1", label: "Client — Address Line 1" },
  { value: "client.address_line2", label: "Client — Address Line 2" },
  { value: "client.city",          label: "Client — City" },
  { value: "client.state",         label: "Client — State" },
  { value: "client.zip",           label: "Client — Zip Code" },
  { value: "client.notes",         label: "Client — Notes" },
  { value: "client.source",        label: "Client — Source" },
  { value: "contact.first_name",   label: "Contact — First Name" },
  { value: "contact.last_name",    label: "Contact — Last Name" },
  { value: "contact.email",        label: "Contact — Email" },
  { value: "contact.phone",        label: "Contact — Phone" },
];

// ── DraftField ────────────────────────────────────────────────────────────────

interface DraftField extends Omit<CRMFormField, "id" | "formId"> {
  _key: string;
  _savedId?: string; // the real DB id once saved, for rule references
}

function newField(sortOrder: number, pageNumber: number): DraftField {
  return {
    _key: `${Date.now()}-${Math.random()}`,
    fieldType: "text",
    label: "",
    placeholder: null,
    description: null,
    required: false,
    sortOrder,
    pageNumber,
    mappedField: null,
    options: null,
    config: {},
  };
}

function defaultConfig(type: FormFieldType): Record<string, unknown> {
  if (type === "rating") return { min: 0, max: 5 };
  if (type === "review") return { max: 5 };
  if (type === "number") return { startingValue: 0 };
  return {};
}

// ── DraftRule ─────────────────────────────────────────────────────────────────

interface DraftRule {
  _key: string;
  sourceFieldKey: string | null; // field._key reference
  operator: FormRuleOperator;
  operand: string | null;
  action: FormRuleAction;
  actionValue: string | null;
}

function newRule(): DraftRule {
  return {
    _key: `r-${Date.now()}-${Math.random()}`,
    sourceFieldKey: null,
    operator: "equals",
    operand: null,
    action: "jump_to_page",
    actionValue: null,
  };
}

// ── Builder tabs ──────────────────────────────────────────────────────────────

type BuilderTab = "fields" | "rules" | "settings";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  form: CRMForm & { fields: CRMFormField[] };
  publicBaseUrl: string;
}

// ── FormBuilder ───────────────────────────────────────────────────────────────

export function FormBuilder({ form, publicBaseUrl }: Props) {
  const saveFields = useSaveFormFields(form.id);
  const { data: savedRules } = useFormRules(form.id);
  const saveRules = useSaveFormRules(form.id);
  const updateForm = useUpdateForm(form.id);

  const [builderTab, setBuilderTab] = useState<BuilderTab>("fields");
  const [activePage, setActivePage] = useState(1);

  const [fields, setFields] = useState<DraftField[]>(() =>
    form.fields.map((f) => ({ ...f, _key: f.id, _savedId: f.id }))
  );
  const [rules, setRules] = useState<DraftRule[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invalidFieldKey, setInvalidFieldKey] = useState<string | null>(null);

  // Don't let a background refetch (e.g. refetchOnWindowFocus) silently
  // overwrite in-progress unsaved edits with stale server data.
  useEffect(() => {
    if (dirty) return;
    setFields(form.fields.map((f) => ({ ...f, _key: f.id, _savedId: f.id })));
  }, [form.fields, dirty]);

  // Warn before a refresh/close discards unsaved field edits — this is
  // exactly how a user can lose newly-added fields without realizing the
  // save never went through.
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Seed rules from DB once loaded
  useEffect(() => {
    if (!savedRules) return;
    // Map source_field_id back to a _key via _savedId
    setRules(
      savedRules.map((r) => ({
        _key: r.id,
        sourceFieldKey: r.sourceFieldId
          ? (fields.find((f) => f._savedId === r.sourceFieldId)?._key ?? null)
          : null,
        operator: r.operator,
        operand: r.operand,
        action: r.action,
        actionValue: r.actionValue,
      }))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRules]);

  const maxPage = Math.max(1, ...fields.map((f) => f.pageNumber ?? 1));
  const pageCount = maxPage;

  function update(key: string, patch: Partial<DraftField>) {
    setFields((prev) => prev.map((f) => f._key === key ? { ...f, ...patch } : f));
    if (key === invalidFieldKey && typeof patch.label === "string" && patch.label.trim()) {
      setInvalidFieldKey(null);
    }
    setDirty(true);
  }

  function updateConfig(key: string, configPatch: Record<string, unknown>) {
    setFields((prev) => prev.map((f) =>
      f._key === key ? { ...f, config: { ...f.config, ...configPatch } } : f
    ));
    setDirty(true);
  }

  function changeType(key: string, type: FormFieldType) {
    const current = fields.find((f) => f._key === key);
    // A2P 10DLC carrier review rejects bundled/implied consent (e.g. "By
    // clicking Submit, you agree...") — this checkbox must stand alone with
    // explicit SMS-specific language. Pre-fill compliant boilerplate so a
    // blank/generic label isn't shipped by default; staff can still edit it,
    // but they start from language that passes review.
    const isSmsOptIn = type === "sms_optin";
    update(key, {
      fieldType: type,
      config: defaultConfig(type),
      options: OPTIONS_TYPES.includes(type) ? (current?.options ?? []) : null,
      required: DISPLAY_TYPES.includes(type) || type === "hidden" ? false : current?.required ?? false,
      label: isSmsOptIn && !current?.label
        ? "I agree to receive text messages from this business about my service appointments and account, including appointment reminders, crew arrival notices, and job status updates."
        : current?.label ?? "",
      description: isSmsOptIn && !current?.description
        ? "Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, HELP for help."
        : current?.description ?? null,
    });
  }

  function addField() {
    const pageFields = fields.filter((f) => (f.pageNumber ?? 1) === activePage);
    setFields((prev) => [...prev, newField(prev.length, activePage)]);
    // Keep sort order clean
    void pageFields;
    setDirty(true);
  }

  function removeField(key: string) {
    setFields((prev) =>
      prev.filter((f) => f._key !== key).map((f, i) => ({ ...f, sortOrder: i }))
    );
    setDirty(true);
  }

  function moveUp(key: string) {
    setFields((prev) => {
      const pageFields = prev
        .map((f, globalIdx) => ({ f, globalIdx }))
        .filter(({ f }) => (f.pageNumber ?? 1) === activePage);
      const localIdx = pageFields.findIndex(({ f }) => f._key === key);
      if (localIdx <= 0) return prev;
      const next = [...prev];
      const a = pageFields[localIdx - 1].globalIdx;
      const b = pageFields[localIdx].globalIdx;
      [next[a], next[b]] = [next[b], next[a]];
      return next.map((f, i) => ({ ...f, sortOrder: i }));
    });
    setDirty(true);
  }

  function moveDown(key: string) {
    setFields((prev) => {
      const pageFields = prev
        .map((f, globalIdx) => ({ f, globalIdx }))
        .filter(({ f }) => (f.pageNumber ?? 1) === activePage);
      const localIdx = pageFields.findIndex(({ f }) => f._key === key);
      if (localIdx >= pageFields.length - 1) return prev;
      const next = [...prev];
      const a = pageFields[localIdx].globalIdx;
      const b = pageFields[localIdx + 1].globalIdx;
      [next[a], next[b]] = [next[b], next[a]];
      return next.map((f, i) => ({ ...f, sortOrder: i }));
    });
    setDirty(true);
  }

  function addPage() {
    const newPageNum = pageCount + 1;
    setFields((prev) => [...prev, newField(prev.length, newPageNum)]);
    setActivePage(newPageNum);
    setDirty(true);
  }

  function deletePage(page: number) {
    if (pageCount <= 1) return;
    setFields((prev) =>
      prev
        .filter((f) => (f.pageNumber ?? 1) !== page)
        .map((f) => ({
          ...f,
          pageNumber: (f.pageNumber ?? 1) > page ? (f.pageNumber ?? 1) - 1 : (f.pageNumber ?? 1),
        }))
        .map((f, i) => ({ ...f, sortOrder: i }))
    );
    setActivePage((p) => Math.min(p, pageCount - 1));
    setDirty(true);
  }

  // Rules helpers
  function updateRule(key: string, patch: Partial<DraftRule>) {
    setRules((prev) => prev.map((r) => r._key === key ? { ...r, ...patch } : r));
    setDirty(true);
  }

  function removeRule(key: string) {
    setRules((prev) => prev.filter((r) => r._key !== key));
    setDirty(true);
  }

  async function handleSave() {
    const invalid = fields.find((f) => !DISPLAY_TYPES.includes(f.fieldType) && !f.label.trim());
    if (invalid) {
      // Jump to the offending field's page and highlight it — a save that
      // silently no-ops here (previously just a small toast) is exactly how
      // a user loses newly-added fields: they see no error, refresh, and the
      // unsaved draft is gone.
      setActivePage(invalid.pageNumber ?? 1);
      setInvalidFieldKey(invalid._key);
      toast.error("Every field needs a label before you can save — the field is highlighted below.", { duration: 6000 });
      requestAnimationFrame(() => {
        document.getElementById(`field-${invalid._key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }

    // SMS consent has to be tied to a phone number — a form that requires
    // the opt-in checkbox but not a phone field can collect "yes, text me"
    // with nothing to text. If the form has no phone field at all, block
    // the save; if it does, silently promote it to required rather than
    // making staff notice and fix it themselves.
    let fieldsToSave = fields;
    if (fields.some((f) => f.fieldType === "sms_optin" && f.required)) {
      const phoneField = fields.find((f) => f.fieldType === "phone");
      if (!phoneField) {
        toast.error("The SMS opt-in field is required, but this form has no Phone field — add one so consent has a number to attach to.", { duration: 7000 });
        return;
      }
      if (!phoneField.required) {
        fieldsToSave = fields.map((f) => f._key === phoneField._key ? { ...f, required: true } : f);
        setFields(fieldsToSave);
        toast.message("Phone is now required, since the SMS opt-in field is required.");
      }
    }

    setInvalidFieldKey(null);
    setSaving(true);
    try {
      const savedFieldData = await saveFields.mutateAsync(
        fieldsToSave.map((f, i) => ({
          // Preserve the real DB id for fields that already exist so the
          // server can update in place instead of delete+reinsert — that
          // reinsert churned field ids on every save, silently orphaning any
          // crm_form_rules row keyed to the old id (source_field_id /
          // actionValue). Omitted for brand-new fields so the server assigns
          // a fresh id.
          ...(f._savedId ? { id: f._savedId } : {}),
          fieldType: f.fieldType,
          label: f.label.trim(),
          placeholder: f.placeholder || null,
          description: f.description || null,
          required: f.required,
          sortOrder: i,
          pageNumber: f.pageNumber ?? 1,
          mappedField: f.mappedField || null,
          options: f.options ?? null,
          config: f.config ?? {},
        }))
      );

      // Re-map _keys to new DB ids for rule references
      const newFieldMap = new Map<string, string>(); // _key → new id
      const savedFields = (savedFieldData?.fields ?? []) as CRMFormField[];
      savedFields.forEach((saved, i) => {
        const draft = fieldsToSave[i];
        if (draft) newFieldMap.set(draft._key, saved.id);
      });

      // Save rules, resolving field keys to real ids. Kept in its own
      // try/catch — Fields already saved successfully above, so a Rules-only
      // failure must not report the whole form as unsaved.
      try {
        await saveRules.mutateAsync(
          rules.map((r, i) => ({
            sourceFieldId: r.sourceFieldKey
              ? (newFieldMap.get(r.sourceFieldKey) ?? fields.find((f) => f._key === r.sourceFieldKey)?._savedId ?? null)
              : null,
            ruleType: "page" as const,
            operator: r.operator,
            operand: r.operand,
            action: r.action,
            actionValue: r.actionValue,
            sortOrder: i,
          }))
        );
        setDirty(false);
        toast.success("Form saved");
      } catch {
        setDirty(false);
        toast.error("Fields saved, but rules failed to save — try again.");
      }
    } catch {
      toast.error("Failed to save form");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    const newStatus = form.status === "published" ? "draft" : "published";
    try {
      await updateForm.mutateAsync({ status: newStatus });
      toast.success(newStatus === "published" ? "Form published" : "Form unpublished");
    } catch {
      toast.error("Failed to update form status");
    }
  }

  const publicUrl = `${publicBaseUrl}/forms/${form.slug}`;
  const pageFields = fields.filter((f) => (f.pageNumber ?? 1) === activePage);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide border",
            form.status === "published"
              ? "bg-green-50 text-green-700 border-green-300"
              : "bg-slate-100 text-slate-500 border-slate-300"
          )}>
            {form.status}
          </span>
          {form.status === "published" && (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <Globe className="h-3 w-3" />
              {publicUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={togglePublish}
            disabled={updateForm.isPending}
          >
            {form.status === "published" ? "Unpublish" : "Publish"}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Builder tab bar */}
      <div className="flex gap-1 rounded-lg border bg-slate-50 p-1 self-start">
        {([
          { key: "fields",   label: "Fields",   icon: Layers },
          { key: "rules",    label: "Rules",    icon: GitBranch },
          { key: "settings", label: "Settings", icon: Settings },
        ] as { key: BuilderTab; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setBuilderTab(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              builderTab === key
                ? "bg-white shadow-sm text-slate-800"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── FIELDS tab ── */}
      {builderTab === "fields" && (
        <div className="flex flex-col gap-4">
          {/* Page tabs */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => (
                <div key={page} className="relative group">
                  <button
                    onClick={() => setActivePage(page)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                      activePage === page
                        ? "bg-brand-600 border-brand-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    )}
                  >
                    PAGE {page}
                    <span className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      activePage === page ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    )}>
                      {fields.filter((f) => (f.pageNumber ?? 1) === page).length}
                    </span>
                  </button>
                  {pageCount > 1 && (
                    <button
                      onClick={() => deletePage(page)}
                      title="Delete page"
                      className="absolute -right-1.5 -top-1.5 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white text-[9px] hover:bg-red-600"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addPage}
              className="flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 py-1.5 text-xs text-slate-400 hover:border-brand-400 hover:text-brand-600 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Page
            </button>
          </div>

          {/* Fields for active page */}
          <div className="flex flex-col gap-3">
            {pageFields.length === 0 && (
              <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-slate-400">
                No fields on this page — click Add Field below
              </div>
            )}

            {pageFields.map((field, idx) => (
              <FieldCard
                key={field._key}
                field={field}
                idx={idx}
                totalFields={pageFields.length}
                hasError={field._key === invalidFieldKey}
                lockRequired={field.fieldType === "phone" && fields.some((f) => f.fieldType === "sms_optin" && f.required)}
                onUpdate={(patch) => update(field._key, patch)}
                onUpdateConfig={(patch) => updateConfig(field._key, patch)}
                onChangeType={(type) => changeType(field._key, type)}
                onMoveUp={() => moveUp(field._key)}
                onMoveDown={() => moveDown(field._key)}
                onRemove={() => removeField(field._key)}
              />
            ))}
          </div>

          <Button variant="outline" size="sm" className="self-start" onClick={addField}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Field
          </Button>
        </div>
      )}

      {/* ── RULES tab ── */}
      {builderTab === "rules" && (
        <RulesEditor
          rules={rules}
          fields={fields}
          pageCount={pageCount}
          onAddRule={() => { setRules((prev) => [...prev, newRule()]); setDirty(true); }}
          onUpdateRule={updateRule}
          onRemoveRule={removeRule}
        />
      )}

      {/* ── SETTINGS tab ── */}
      {builderTab === "settings" && (
        <SettingsPanel
          form={form}
          onUpdate={(patch) => {
            updateForm.mutateAsync(patch).catch(() => toast.error("Failed to save setting"));
          }}
        />
      )}
    </div>
  );
}

// ── FieldCard ─────────────────────────────────────────────────────────────────

interface FieldCardProps {
  field: DraftField;
  idx: number;
  totalFields: number;
  hasError?: boolean;
  /** True when this is the form's phone field and a required sms_optin
   *  field exists — consent needs a number to attach to, so this can't be
   *  turned back off from here (see handleSave, which enforces the same
   *  rule server-side by promoting it before save). */
  lockRequired?: boolean;
  onUpdate: (patch: Partial<DraftField>) => void;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
  onChangeType: (type: FormFieldType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function FieldCard({
  field, idx, totalFields, hasError, lockRequired,
  onUpdate, onUpdateConfig, onChangeType, onMoveUp, onMoveDown, onRemove,
}: FieldCardProps) {
  const isDisplay = DISPLAY_TYPES.includes(field.fieldType);
  // "hidden" is deliberately NOT in DISPLAY_TYPES (it still needs a label,
  // for the formData key, and is mappable to a CRM field) — but every
  // required-field check in the app (submit-form-response.ts,
  // forms/[slug]/page.tsx, FillOutFormDialog.tsx) treats it as a display
  // type and skips it, since a submitter never sees it to fill in. Leaving
  // the Required checkbox enabled here let staff check it expecting it to
  // block submission, when it's actually unenforceable everywhere.
  const requiredUnenforceable = field.fieldType === "hidden";

  return (
    <div
      id={`field-${field._key}`}
      className={cn(
        "rounded-lg border bg-white shadow-sm",
        hasError && "border-red-400 ring-1 ring-red-200"
      )}
    >
      {/* Card header row */}
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto_auto_auto] gap-3 items-start p-4">
        {/* Type selector */}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase tracking-widest text-slate-400">Type</Label>
          <Select
            value={field.fieldType}
            onValueChange={(v) => onChangeType(v as FormFieldType)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue>{FIELD_TYPE_LABEL[field.fieldType]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPE_GROUPS.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                    {group.label}
                  </SelectLabel>
                  {group.types.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Label / heading text */}
        <div className="space-y-1">
          <Label className={cn("text-[10px] uppercase tracking-widest", hasError ? "text-red-500" : "text-slate-400")}>
            {field.fieldType === "header" ? "Heading Text" :
             field.fieldType === "paragraph" ? "Label (optional)" :
             field.fieldType === "divider" ? "—" : "Label"}
            {hasError && " — required"}
          </Label>
          {field.fieldType === "divider" ? (
            <div className="h-8 flex items-center">
              <div className="w-full border-t border-slate-300" />
            </div>
          ) : (
            <Input
              autoFocus={hasError}
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              placeholder={
                field.fieldType === "header" ? "Section heading…" :
                field.fieldType === "paragraph" ? "Optional label…" :
                "Field label…"
              }
              className={cn("h-8 text-xs", hasError && "border-red-400 focus-visible:ring-red-400")}
            />
          )}
        </div>

        {/* Required (hidden for display types) */}
        <div className="space-y-1 flex flex-col items-center pt-0.5">
          <Label className="text-[10px] uppercase tracking-widest text-slate-400">Req.</Label>
          <Checkbox
            checked={lockRequired ? true : requiredUnenforceable ? false : field.required}
            disabled={isDisplay || lockRequired || requiredUnenforceable}
            title={
              lockRequired ? "Required because the SMS opt-in field on this form is required" :
              requiredUnenforceable ? "Hidden fields are never shown to the submitter, so \"required\" can't be enforced" :
              undefined
            }
            onCheckedChange={(v) => onUpdate({ required: !!v })}
            className="mt-1.5"
          />
        </div>

        {/* Move up / down */}
        <div className="flex flex-col gap-0.5 mt-5">
          <button
            onClick={onMoveUp}
            disabled={idx === 0}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5 text-slate-500" />
          </button>
          <button
            onClick={onMoveDown}
            disabled={idx === totalFields - 1}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-slate-100 disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5 text-slate-500" />
          </button>
        </div>

        {/* Delete */}
        <button
          onClick={onRemove}
          className="mt-5 flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Field mapping — sms_optin is detected by field type, not a mapping,
          so it gets its own note below (in FieldTypeConfig) instead.
          attachment is excluded too: a mapped CRM field expects a scalar
          string (submit-form-response.ts does mappedData[field] =
          String(value)), but an attachment's answer is a
          {path,name,size} object — mapping one silently wrote the literal
          text "[object Object]" into whatever CRM field it was mapped to. */}
      {!isDisplay && field.fieldType !== "sms_optin" && field.fieldType !== "attachment" && (
        <div className="border-t border-slate-100 px-4 py-2.5 flex items-center gap-3">
          <Label className="text-[10px] uppercase tracking-widest text-slate-400 shrink-0 w-24">
            Map to field
          </Label>
          <Select
            value={field.mappedField ?? "__none__"}
            onValueChange={(v) => onUpdate({ mappedField: v === "__none__" ? null : v })}
          >
            <SelectTrigger className="h-7 text-xs flex-1 max-w-xs">
              <SelectValue placeholder="Not mapped" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not mapped</SelectItem>
              {MAPPED_FIELD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.mappedField && (
            <span className="text-[10px] text-brand-600 font-medium">mapped</span>
          )}
        </div>
      )}

      {/* Type-specific config */}
      <FieldTypeConfig field={field} onUpdate={onUpdate} onUpdateConfig={onUpdateConfig} />
    </div>
  );
}

// ── RulesEditor ───────────────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<string, string> = {
  equals: "Is equal to",
  not_equals: "Is not equal to",
  greater_than: "Is greater than",
  less_than: "Is less than",
  contains: "Contains",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
};

const ACTION_LABELS: Record<string, string> = {
  jump_to_page: "Jump to Page",
  show_field: "Show Field",
  hide_field: "Hide Field",
  add_tag: "Add Tag",
  remove_tag: "Remove Tag",
};

function RulesEditor({
  rules, fields, pageCount, onAddRule, onUpdateRule, onRemoveRule,
}: {
  rules: DraftRule[];
  fields: DraftField[];
  pageCount: number;
  onAddRule: () => void;
  onUpdateRule: (key: string, patch: Partial<DraftRule>) => void;
  onRemoveRule: (key: string) => void;
}) {
  const namedFields = fields.filter((f) => !DISPLAY_TYPES.includes(f.fieldType) && f.label.trim());

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500">
        Set conditional rules to control form behavior — jump to a page or add a tag based on a
        field value.
      </p>

      {rules.length === 0 && (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-slate-400">
          No rules yet — click Add Rule to get started
        </div>
      )}

      {rules.map((rule, idx) => (
        <div key={rule._key} className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Rule #{idx + 1}
            </span>
            <button
              onClick={() => onRemoveRule(rule._key)}
              className="text-slate-400 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* IF */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 w-6">If</span>
              <Select
                value={rule.sourceFieldKey ?? "__none__"}
                onValueChange={(v) => onUpdateRule(rule._key, { sourceFieldKey: v === "__none__" ? null : v })}
              >
                <SelectTrigger className="h-7 text-xs flex-1">
                  <SelectValue placeholder="Select field…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select field…</SelectItem>
                  {namedFields.map((f) => (
                    <SelectItem key={f._key} value={f._key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pl-8">
              <Select
                value={rule.operator}
                onValueChange={(v) => onUpdateRule(rule._key, { operator: v as FormRuleOperator })}
              >
                <SelectTrigger className="h-7 text-xs w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
                <Input
                  value={rule.operand ?? ""}
                  onChange={(e) => onUpdateRule(rule._key, { operand: e.target.value || null })}
                  placeholder="Value…"
                  className="h-7 text-xs flex-1"
                />
              )}
            </div>

            {/* THEN */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 w-6">Then</span>
              <Select
                value={rule.action}
                onValueChange={(v) => onUpdateRule(rule._key, { action: v as FormRuleAction, actionValue: null })}
              >
                <SelectTrigger className="h-7 text-xs w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {rule.action === "jump_to_page" && (
                <Select
                  value={rule.actionValue ?? ""}
                  onValueChange={(v) => onUpdateRule(rule._key, { actionValue: v })}
                >
                  <SelectTrigger className="h-7 text-xs w-28">
                    <SelectValue placeholder="Page…" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: pageCount }, (_, i) => String(i + 1)).map((p) => (
                      <SelectItem key={p} value={p}>Page {p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {(rule.action === "add_tag" || rule.action === "remove_tag") && (
                <Input
                  value={rule.actionValue ?? ""}
                  onChange={(e) => onUpdateRule(rule._key, { actionValue: e.target.value || null })}
                  placeholder="Tag name…"
                  className="h-7 text-xs flex-1"
                />
              )}

              {(rule.action === "show_field" || rule.action === "hide_field") && (
                <Select
                  value={rule.actionValue ?? ""}
                  onValueChange={(v) => onUpdateRule(rule._key, { actionValue: v })}
                >
                  <SelectTrigger className="h-7 text-xs flex-1">
                    <SelectValue placeholder="Select field…" />
                  </SelectTrigger>
                  <SelectContent>
                    {namedFields.map((f) => (
                      <SelectItem key={f._key} value={f._key}>{f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" className="self-start" onClick={onAddRule}>
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Add Rule
      </Button>
    </div>
  );
}

// ── SettingsPanel ─────────────────────────────────────────────────────────────

function SettingsPanel({
  form,
  onUpdate,
}: {
  form: CRMForm;
  onUpdate: (patch: Partial<CRMForm>) => void;
}) {
  const [name, setName] = useState(form.name);

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm space-y-5 max-w-lg">
      <div>
        <Label className="text-xs font-medium text-slate-700">Form Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== form.name) onUpdate({ name: name.trim() }); }}
          className="mt-1 h-8 text-sm"
        />
      </div>
      <div>
        <Label className="text-xs font-medium text-slate-700">Submit Button Label</Label>
        <Input
          defaultValue={(form.settings.submitLabel as string) ?? "Submit"}
          onBlur={(e) => {
            onUpdate({ settings: { ...form.settings, submitLabel: e.target.value || "Submit" } });
          }}
          className="mt-1 h-8 text-sm"
        />
      </div>
    </div>
  );
}

// ── FieldTypeConfig ───────────────────────────────────────────────────────────

function FieldTypeConfig({
  field, onUpdate, onUpdateConfig,
}: {
  field: DraftField;
  onUpdate: (patch: Partial<DraftField>) => void;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
}) {
  const baseClass = "border-t border-slate-100 px-4 pb-4 pt-3 space-y-3";
  const labelClass = "text-[10px] uppercase tracking-widest text-slate-400";
  const inputClass = "h-7 text-xs";

  if (OPTIONS_TYPES.includes(field.fieldType)) {
    return (
      <div className={baseClass}>
        <div>
          <Label className={labelClass}>Options (one per line)</Label>
          <textarea
            value={(field.options ?? []).join("\n")}
            onChange={(e) =>
              onUpdate({
                options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
              })
            }
            rows={4}
            placeholder={"Option A\nOption B\nOption C"}
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <PlaceholderRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
        <DescriptionRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
      </div>
    );
  }

  if (field.fieldType === "rating") {
    const max = (field.config.max as number) ?? 5;
    return (
      <div className={baseClass}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>Scale (max)</Label>
            <Select
              value={String(max)}
              onValueChange={(v) => onUpdateConfig({ max: Number(v) })}
            >
              <SelectTrigger className="mt-1 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">0 – 5</SelectItem>
                <SelectItem value="10">0 – 10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClass}>Scale labels (optional)</Label>
            <div className="mt-1 flex gap-2">
              <Input
                value={(field.config.labelMin as string) ?? ""}
                onChange={(e) => onUpdateConfig({ labelMin: e.target.value })}
                placeholder="0 = Worst"
                className={inputClass}
              />
              <Input
                value={(field.config.labelMax as string) ?? ""}
                onChange={(e) => onUpdateConfig({ labelMax: e.target.value })}
                placeholder={`${max} = Best`}
                className={inputClass}
              />
            </div>
          </div>
        </div>
        <RatingPreview max={max} />
        <DescriptionRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
      </div>
    );
  }

  if (field.fieldType === "review") {
    const max = (field.config.max as number) ?? 5;
    return (
      <div className={baseClass}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>Max stars</Label>
            <Select
              value={String(max)}
              onValueChange={(v) => onUpdateConfig({ max: Number(v) })}
            >
              <SelectTrigger className="mt-1 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} stars</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className={labelClass}>Comment placeholder</Label>
            <Input
              value={field.placeholder ?? ""}
              onChange={(e) => onUpdate({ placeholder: e.target.value || null })}
              placeholder="Write a review of our service…"
              className={cn("mt-1", inputClass)}
            />
          </div>
        </div>
        <div className="flex gap-0.5 mt-1">
          {Array.from({ length: max }).map((_, i) => (
            <span key={i} className="text-amber-400 text-lg">★</span>
          ))}
        </div>
        <DescriptionRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
      </div>
    );
  }

  if (field.fieldType === "number") {
    return (
      <div className={baseClass}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className={labelClass}>Starting value</Label>
            <Input
              type="number"
              value={(field.config.startingValue as number) ?? 0}
              onChange={(e) => onUpdateConfig({ startingValue: Number(e.target.value) })}
              className={cn("mt-1", inputClass)}
            />
          </div>
          <PlaceholderRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
        </div>
        <DescriptionRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
      </div>
    );
  }

  if (field.fieldType === "hidden") {
    return (
      <div className={baseClass}>
        <div>
          <Label className={labelClass}>Default value (stored on submit)</Label>
          <Input
            value={(field.config.defaultValue as string) ?? ""}
            onChange={(e) => onUpdateConfig({ defaultValue: e.target.value })}
            placeholder="Internal value…"
            className={cn("mt-1", inputClass)}
          />
        </div>
        <p className="text-[11px] text-slate-400">This field is invisible to form submitters. Map it to a client field to populate data silently on submit.</p>
      </div>
    );
  }

  if (field.fieldType === "paragraph") {
    return (
      <div className={baseClass}>
        <div>
          <Label className={labelClass}>Paragraph text</Label>
          <textarea
            value={field.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value || null })}
            rows={3}
            placeholder="Enter the paragraph body text…"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>
    );
  }

  if (field.fieldType === "sms_optin") {
    return (
      <div className={baseClass}>
        <p className="text-[11px] text-slate-400">
          No mapping needed — a checked box on submit automatically records SMS
          consent on the matched/created client. Keep the label/consent text a
          standalone, explicit statement rather than folding it into general
          terms-acceptance language, or carrier review will reject it. Links to
          the Privacy Policy and SMS Terms &amp; Conditions render automatically
          below this field — no need to add them to the text here.
        </p>
        <div>
          <Label className={labelClass}>Consent text</Label>
          <Input
            value={field.description ?? ""}
            onChange={(e) => onUpdate({ description: e.target.value || null })}
            placeholder="I agree to receive text messages…"
            className={cn("mt-1", inputClass)}
          />
        </div>
      </div>
    );
  }

  if (field.fieldType === "attachment") {
    return (
      <div className={baseClass}>
        <DescriptionRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
        <p className="text-[11px] text-slate-400">Max file size: 15 MB. Accepted formats: JPEG, PNG, WEBP, GIF, PDF.</p>
      </div>
    );
  }

  if (PLACEHOLDER_TYPES.includes(field.fieldType) || field.fieldType === "checkbox" || field.fieldType === "date") {
    return (
      <div className={baseClass}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLACEHOLDER_TYPES.includes(field.fieldType) && (
            <PlaceholderRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
          )}
          <DescriptionRow field={field} onUpdate={onUpdate} inputClass={inputClass} labelClass={labelClass} />
        </div>
      </div>
    );
  }

  return null;
}

// ── Shared config sub-rows ────────────────────────────────────────────────────

function PlaceholderRow({ field, onUpdate, inputClass, labelClass }: {
  field: DraftField;
  onUpdate: (patch: Partial<DraftField>) => void;
  inputClass: string;
  labelClass: string;
}) {
  return (
    <div>
      <Label className={labelClass}>Placeholder (optional)</Label>
      <Input
        value={field.placeholder ?? ""}
        onChange={(e) => onUpdate({ placeholder: e.target.value || null })}
        placeholder="Hint text inside the field…"
        className={cn("mt-1", inputClass)}
      />
    </div>
  );
}

function DescriptionRow({ field, onUpdate, inputClass, labelClass }: {
  field: DraftField;
  onUpdate: (patch: Partial<DraftField>) => void;
  inputClass: string;
  labelClass: string;
}) {
  return (
    <div>
      <Label className={labelClass}>Helper text (optional)</Label>
      <Input
        value={field.description ?? ""}
        onChange={(e) => onUpdate({ description: e.target.value || null })}
        placeholder="Shown below the field label…"
        className={cn("mt-1", inputClass)}
      />
    </div>
  );
}

// ── RatingPreview ─────────────────────────────────────────────────────────────

function RatingPreview({ max }: { max: number }) {
  return (
    <div className="flex gap-1 mt-1">
      {Array.from({ length: max + 1 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded border text-xs font-semibold",
            i === 0
              ? "border-slate-300 bg-white text-slate-500"
              : "border-brand-300 bg-brand-50 text-brand-700"
          )}
        >
          {i}
        </div>
      ))}
    </div>
  );
}
