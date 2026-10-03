import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Only the settings keys the public renderer (app/forms/[slug]/page.tsx) reads.
// The full settings blob also holds staff-only config (notification
// recipients, fromEmail, tagsOnSubmit…) that must never reach anonymous users.
const PUBLIC_SETTING_KEYS = [
  "confirmationType", "confirmationUrl", "confirmationMessage", "successMessage", "submitLabel",
] as const;

function publicSettings(settings: unknown): Record<string, unknown> {
  const src = (settings && typeof settings === "object" ? settings : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_SETTING_KEYS) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

// GET /api/public/forms/[slug] — fetch published form + fields (no auth)
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: form, error } = await db
    .from("crm_forms")
    .select("id, name, slug, description, settings")
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .single();

  if (error || !form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  const { data: fields } = await db
    .from("crm_form_fields")
    .select("id, field_type, label, placeholder, description, required, sort_order, page_number, options, config")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  const { data: rules } = await db
    .from("crm_form_rules")
    .select("id, source_field_id, operator, operand, action, action_value, sort_order")
    .eq("form_id", form.id)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  return NextResponse.json({
    id: form.id,
    name: form.name,
    slug: form.slug,
    description: form.description,
    settings: publicSettings(form.settings),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fields: (fields ?? []).map((f: any) => ({
      id: f.id,
      fieldType: f.field_type,
      label: f.label,
      placeholder: f.placeholder,
      description: f.description,
      required: f.required,
      sortOrder: f.sort_order,
      pageNumber: f.page_number ?? 1,
      options: f.options,
      config: f.config ?? {},
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rules: (rules ?? []).map((r: any) => ({
      id: r.id,
      sourceFieldId: r.source_field_id,
      operator: r.operator,
      operand: r.operand,
      action: r.action,
      actionValue: r.action_value,
    })),
  });
}
