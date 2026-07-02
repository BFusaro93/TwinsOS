import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  return NextResponse.json({
    id: form.id,
    name: form.name,
    slug: form.slug,
    description: form.description,
    settings: form.settings ?? {},
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
  });
}
