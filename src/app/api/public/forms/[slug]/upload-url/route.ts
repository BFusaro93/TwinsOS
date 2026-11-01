import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { checkAuthRateLimit, getClientIp } from "@/lib/auth/rate-limit";
import { sanitizeStorageFileName } from "@/lib/hooks/use-attachments";

// Mirrors the form-attachments bucket's own limits (20260806000006).
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

// POST /api/public/forms/[slug]/upload-url — anonymous attachment upload for a published form.
// Anonymous visitors can no longer write to the form-attachments bucket directly (that left
// uploads unthrottled and un-Turnstiled); they ask here for a one-shot signed upload URL, which
// is rate limited per IP + form.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9_-]{0,99}$/i.test(slug)) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }
  if (!(await checkAuthRateLimit(`form-upload:${slug}:${getClientIp(req)}`, 20, 600))) {
    return NextResponse.json({ error: "Too many uploads. Please try again in a few minutes." }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as { fileName?: unknown; size?: unknown; type?: unknown } | null;
  if (
    !body ||
    typeof body.fileName !== "string" || !body.fileName ||
    typeof body.size !== "number" || !Number.isFinite(body.size) || body.size <= 0 ||
    typeof body.type !== "string"
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "File is too large (max 15 MB)." }, { status: 400 });
  }
  if (!ALLOWED_ATTACHMENT_TYPES.has(body.type)) {
    return NextResponse.json({ error: "Unsupported file type — images and PDFs only." }, { status: 400 });
  }

  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: form } = await (service as any)
    .from("crm_forms")
    .select("id")
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle() as { data: { id: string } | null };
  if (!form) return NextResponse.json({ error: "Form not found" }, { status: 404 });

  // Same key shape the submit route validates: `${form.id}/${uuid}-${filename}`.
  const path = `${form.id}/${crypto.randomUUID()}-${sanitizeStorageFileName(body.fileName.slice(0, 200))}`;
  const { data, error } = await service.storage.from("form-attachments").createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: "Could not start the upload" }, { status: 500 });
  }
  return NextResponse.json({ path, token: data.token });
}
