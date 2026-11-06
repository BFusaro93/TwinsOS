import { heicToJpeg, isHeic, HEIC_MAX_BYTES } from "@/lib/utils/convert-heic";
import { validateImageUpload } from "@/lib/utils/image-upload";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MAX_REPLY_PHOTOS = 5;
const BUCKET = "attachments";

export interface MessagePhoto {
  url: string;
  name: string;
}

/**
 * Stores photos sent with a ticket reply: uploads each to the attachments
 * bucket, files it as a normal ticket attachment (so staff see it on the Files
 * tab) and returns the storage paths to keep on the message. `db` must be the
 * service client — portal logins have no profile, so they can't satisfy the
 * org-member storage policy; the caller has already authorized the ticket.
 *
 * Returns `{ error }` for a bad file (nothing is left uploaded) rather than
 * throwing, so the route can answer 400.
 */
export async function storeReplyPhotos(
  db: any,
  args: { orgId: string; ticketId: string; files: File[]; uploadedByName: string }
): Promise<{ paths: string[] } | { error: string }> {
  if (args.files.length > MAX_REPLY_PHOTOS) return { error: `You can attach up to ${MAX_REPLY_PHOTOS} photos.` };
  const uploaded: string[] = [];
  const cleanup = async () => {
    if (uploaded.length) await db.storage.from(BUCKET).remove(uploaded);
  };
  for (const file of args.files) {
    const image = validateImageUpload(file);
    if (!image.ok) {
      await cleanup();
      return { error: image.error };
    }
    const convert = isHeic(file);
    if (convert && file.size > HEIC_MAX_BYTES) {
      await cleanup();
      return { error: "HEIC photos must be 15MB or smaller" };
    }
    let contentType = image.contentType;
    let buffer: Buffer = Buffer.from(await file.arrayBuffer());
    if (convert) {
      buffer = await heicToJpeg(buffer);
      contentType = "image/jpeg";
    }
    const ext = convert ? "jpg" : image.ext;
    // org_id leads the path: the bucket's policies scope on the first folder.
    const path = `${args.orgId}/ticket-replies/${args.ticketId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await db.storage.from(BUCKET).upload(path, buffer, { contentType });
    if (upErr) {
      await cleanup();
      return { error: "Couldn't upload that photo. Please try again." };
    }
    uploaded.push(path);
    const { error: attErr } = await db.from("attachments").insert({
      org_id: args.orgId,
      record_type: "ticket",
      record_id: args.ticketId,
      file_name: convert ? file.name.replace(/\.(heic|heif)$/i, ".jpg") : file.name || `photo.${ext}`,
      file_size: buffer.length,
      file_type: contentType,
      storage_path: path,
      uploaded_by_name: args.uploadedByName,
    });
    if (attErr) {
      await cleanup();
      return { error: "Couldn't save that photo. Please try again." };
    }
  }
  return { paths: uploaded };
}

/** Signed URLs (read-time, never stored) for the photos on a set of messages, keyed by storage path. */
export async function signPhotoPaths(db: any, paths: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const out = new Map<string, string>();
  if (!unique.length) return out;
  const { data } = await db.storage.from(BUCKET).createSignedUrls(unique, 3600);
  for (const row of (data ?? []) as { path: string | null; signedUrl: string | null }[]) {
    if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  }
  return out;
}

export function photosForMessage(paths: string[] | null | undefined, signed: Map<string, string>): MessagePhoto[] {
  return (paths ?? []).flatMap((p) => {
    const url = signed.get(p);
    return url ? [{ url, name: p.split("/").pop() ?? "photo" }] : [];
  });
}
