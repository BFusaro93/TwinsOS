import { NextResponse } from "next/server";
import { z } from "zod";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { createServiceClient } from "@/lib/supabase/server";

const UpdateSchema = z.object({
  primary_phone: z.string().max(30).nullable().optional(),
});

const ContactSchema = z.object({
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  phoneType: z.enum(["cell", "home", "work", "fax", "other"]).optional(),
  role: z.string().max(100).optional(),
});

export async function PATCH(req: Request) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("clients")
    .update({ primary_phone: parsed.data.primary_phone ?? null, updated_at: new Date().toISOString() })
    .eq("id", ctx.clientId)
    .eq("org_id", ctx.orgId);

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function POST(req: Request) {
  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("client_contacts")
    .insert({
      org_id: ctx.orgId,
      client_id: ctx.clientId,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name ?? null,
      email: parsed.data.email || null,
      phone: parsed.data.phone ?? null,
      phone_type: parsed.data.phone ? (parsed.data.phoneType ?? "cell") : null,
      contact_type: parsed.data.role ?? null,
    })
    .select("id, first_name, last_name, email, phone, contact_type")
    .single();

  if (error) {
    console.error("[portal/account] Failed to add contact:", error);
    return NextResponse.json({ error: "Failed to add contact" }, { status: 500 });
  }

  return NextResponse.json({ success: true, contact: data });
}
