import { createServiceClient } from "@/lib/supabase/server";

/** @react-pdf can only decode these; a HEIC/WebP/GIF in the document throws and fails the whole render. */
const PDF_IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png"]);

/**
 * Downloads one customer-facing estimate photo as a data URI for embedding in a PDF/email, or
 * null when it can't be embedded (wrong org prefix, unsupported type, download failed).
 *
 * Signed with the service client: the attachments bucket's SELECT policy only exposes objects
 * that have a public.attachments row, and estimate photos don't — a session-scoped
 * createSignedUrl always returned null, so photos silently never reached the PDF or the email.
 * The org prefix check keeps a crafted estimate_photos row from pulling another org's object.
 */
export async function embedEstimatePhoto(storagePath: string, orgId: string): Promise<string | null> {
  if (!storagePath.startsWith(`${orgId}/`) && !storagePath.startsWith(`estimate-photos/${orgId}/`)) return null;
  try {
    const { data: signed } = await createServiceClient().storage.from("attachments").createSignedUrl(storagePath, 300);
    if (!signed?.signedUrl) return null;
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim().toLowerCase();
    if (!PDF_IMAGE_MIME.has(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
