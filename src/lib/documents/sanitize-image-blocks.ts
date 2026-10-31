import sharp from "sharp";
import { assertPublicHttpsUrl } from "@/lib/net/ssrf-guard";

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp|avif);base64,([a-z0-9+/=\s]+)$/i;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // matches the document-images bucket limit
const FETCH_TIMEOUT_MS = 8000;
const MAX_WIDTH_PX = 1400;

/**
 * react-pdf can only embed JPEG/PNG, but the editor accepts WEBP/GIF/AVIF too
 * (and a remote URL can't be embedded without fetching it), so every image that
 * reaches the PDF is resolved here to a re-encoded JPEG data URI. Returns null
 * for anything that isn't a public https image or a base64 image data URI —
 * never file paths, http, or internal hosts.
 */
async function toPdfImage(rawSrc: string): Promise<string | null> {
  const src = rawSrc.trim();
  try {
    let input: Buffer;
    const data = DATA_IMAGE_RE.exec(src);
    if (data) {
      input = Buffer.from(data[2].replace(/\s+/g, ""), "base64");
    } else {
      const check = await assertPublicHttpsUrl(src);
      if (!check.ok) return null;
      // redirect:"error" — a redirect could point somewhere assertPublicHttpsUrl never checked.
      const res = await fetch(src, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) return null;
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_IMAGE_BYTES) return null;
      input = Buffer.from(await res.arrayBuffer());
    }
    if (input.length > MAX_IMAGE_BYTES) return null;
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width: MAX_WIDTH_PX, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

// An <img> inside rich-text block content. Block content can be a JSON string
// (columns), so the src may sit behind escaped quotes — match the https URL
// itself rather than the quoting.
const INLINE_IMG_RE = /(<img\b[^>]*?\bsrc=\\?["'])(https:\/\/[^"'\\]+|data:image\/[^"'\\]+)/gi;

async function inlineRichTextImages(html: string): Promise<string> {
  const urls = new Set<string>();
  for (const m of html.matchAll(INLINE_IMG_RE)) urls.add(m[2]);
  if (urls.size === 0) return html;
  const resolved = new Map<string, string | null>();
  await Promise.all([...urls].map(async (u) => resolved.set(u, await toPdfImage(u.replace(/&amp;/g, "&")))));
  return html.replace(INLINE_IMG_RE, (full, head: string, url: string) => {
    const data = resolved.get(url);
    return data ? `${head}${data}` : `${head}data:,`; // unresolvable → dropped by the PDF converter
  });
}

/**
 * Prepares document blocks for the PDF renderer: image blocks and inline
 * rich-text images become embeddable data URIs. Invalid sources are blanked so
 * the renderer shows its "[No image selected]" placeholder (or skips the
 * inline image) instead.
 */
export async function sanitizeImageBlocks<T extends { blockType: string; content: string | null }>(
  blocks: T[],
): Promise<T[]> {
  return Promise.all(
    blocks.map(async (b) => {
      if (!b.content) return b;
      if (b.blockType === "image") return { ...b, content: await toPdfImage(b.content) };
      if (b.content.includes("<img")) return { ...b, content: await inlineRichTextImages(b.content) };
      return b;
    }),
  );
}
