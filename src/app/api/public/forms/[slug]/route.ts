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

// GET /api/public/forms/[slug] — fetch published form + fields (no auth).
// Goes through the get_public_form() SECURITY DEFINER RPC (migration
// 20261227000100): the anon table policies that used to back this read exposed
// whole crm_forms rows (settings, org_id) to anyone with the anon key.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("get_public_form", { p_slug: slug });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const form = data as { id: string; name: string; slug: string; description: string | null; settings: unknown; fields: any[]; rules: any[] } | null;
  if (error || !form) return NextResponse.json({ error: "Form not found" }, { status: 404 });
  const fields = form.fields;
  const rules = form.rules;

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
