import { logger } from "@/lib/logger";
import { heicToJpeg } from "@/lib/utils/convert-heic";

const log = logger.child("sms media");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

/** One MMS attachment as stored on client_activity.media. */
export type SmsMediaItem = {
  content_type: string;
  /** Twilio's media URL (api.twilio.com; may need the account's credentials to fetch). */
  twilio_url: string;
  /** Path in the `attachments` bucket when copied, else null (Twilio URL only). */
  storage_path: string | null;
};

/** Twilio allows 10 media per MMS. */
const MAX_MEDIA = 10;
/** Copy limit per file; anything larger stays a Twilio URL. */
const MAX_COPY_BYTES = 10 * 1024 * 1024;

/** Image types the `attachments` bucket accepts (SVG deliberately excluded — scriptable). */
const COPYABLE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "jpg",
  "image/heif": "jpg",
};

/** NumMedia / MediaUrlN / MediaContentTypeN from an inbound webhook. Only api.twilio.com URLs are kept. */
export function parseInboundMedia(params: Record<string, string>): { url: string; contentType: string }[] {
  const n = Math.min(Math.max(parseInt(params.NumMedia ?? "0", 10) || 0, 0), MAX_MEDIA);
  const out: { url: string; contentType: string }[] = [];
  for (let i = 0; i < n; i++) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.hostname !== "api.twilio.com") continue;
    } catch {
      continue;
    }
    out.push({ url, contentType: (params[`MediaContentType${i}`] ?? "").toLowerCase() });
  }
  return out;
}

/**
 * Basic-auth header for fetching an org's Twilio media — the same credential
 * pairing sendClientSms uses: an org on its own subaccount authenticates as
 * the Landscapt platform (parent) account, everyone else as the legacy
 * env account. Null when nothing is configured (the fetch is then tried
 * without auth, which works unless "HTTP Auth on media URLs" is on).
 */
async function mediaAuthHeader(supabase: AnyClient, orgId: string): Promise<string | null> {
  const { data: org } = await supabase.from("organizations").select("twilio_account_sid").eq("id", orgId).maybeSingle();
  const sid = org?.twilio_account_sid ? process.env.TWILIO_PLATFORM_ACCOUNT_SID : process.env.TWILIO_ACCOUNT_SID;
  const token = org?.twilio_account_sid ? process.env.TWILIO_PLATFORM_AUTH_TOKEN : process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

/**
 * Copies each inbound MMS attachment into Supabase Storage (`attachments`
 * bucket, `<org_id>/sms-media/<MessageSid>/<n>.<ext>`). Images only — other
 * types (video, audio, vCard), oversize files and any copy failure keep just
 * the Twilio URL, so nothing is lost and the webhook never fails over media.
 */
export async function copyInboundMedia(
  supabase: AnyClient,
  orgId: string,
  messageSid: string,
  media: { url: string; contentType: string }[],
): Promise<SmsMediaItem[]> {
  if (media.length === 0) return [];
  const auth = await mediaAuthHeader(supabase, orgId);
  const items: SmsMediaItem[] = [];
  for (let i = 0; i < media.length; i++) {
    const { url, contentType } = media[i];
    const item: SmsMediaItem = { content_type: contentType, twilio_url: url, storage_path: null };
    items.push(item);
    const ext = COPYABLE[contentType];
    if (!ext) continue;
    try {
      // Twilio redirects to a signed CDN URL; fetch drops the Authorization
      // header on that cross-origin hop, which is what the CDN expects.
      const res = await fetch(url, { headers: auth ? { Authorization: auth } : {}, signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > MAX_COPY_BYTES) continue;
      let buffer: Buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_COPY_BYTES) continue;
      let uploadType = contentType === "image/jpg" ? "image/jpeg" : contentType;
      if (contentType === "image/heic" || contentType === "image/heif") {
        buffer = await heicToJpeg(buffer);
        uploadType = "image/jpeg";
      }
      // org_id MUST lead the path — the bucket's policies scope on the first folder.
      const path = `${orgId}/sms-media/${messageSid}/${i}.${ext}`;
      const { error } = await supabase.storage.from("attachments").upload(path, buffer, { contentType: uploadType, upsert: true });
      if (error) throw new Error(error.message);
      item.storage_path = path;
    } catch (err) {
      log.warn("couldn't copy MMS media; keeping the Twilio URL", {
        orgId,
        index: i,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return items;
}

/**
 * Attaches the copied images to a ticket (the shared `attachments` table, so
 * they show in the ticket's Files like a portal photo). Best-effort.
 */
export async function attachMediaToTicket(
  supabase: AnyClient,
  params: { orgId: string; ticketId: string; uploadedByName: string; media: SmsMediaItem[] },
): Promise<void> {
  const rows = params.media
    .filter((m) => m.storage_path)
    .map((m, i) => ({
      org_id: params.orgId,
      record_type: "ticket",
      record_id: params.ticketId,
      file_name: `text-photo-${i + 1}.${m.storage_path!.split(".").pop()}`,
      file_type: m.content_type === "image/heic" || m.content_type === "image/heif" || m.content_type === "image/jpg" ? "image/jpeg" : m.content_type,
      storage_path: m.storage_path,
      uploaded_by_name: `${params.uploadedByName} (text)`,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("attachments").insert(rows);
  if (error) log.warn("couldn't attach MMS media to ticket", { ticketId: params.ticketId, error: error.message });
}
