import { assertPublicHttpsUrl } from "@/lib/net/ssrf-guard";

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;

/**
 * Document image blocks hold a user-supplied URL. Before handing it to the
 * server-side PDF renderer (which fetches it), only allow base64 image data
 * URIs or https URLs that resolve to a public address — never file paths,
 * http, or internal hosts. Invalid sources are blanked so the renderer shows
 * its "[No image selected]" placeholder instead.
 */
export async function sanitizeImageBlocks<T extends { blockType: string; content: string | null }>(
  blocks: T[],
): Promise<T[]> {
  return Promise.all(
    blocks.map(async (b) => {
      if (b.blockType !== "image" || !b.content) return b;
      const src = b.content.trim();
      if (DATA_IMAGE_RE.test(src)) return b;
      const check = await assertPublicHttpsUrl(src).catch(() => ({ ok: false as const }));
      return check.ok ? b : { ...b, content: null };
    }),
  );
}
