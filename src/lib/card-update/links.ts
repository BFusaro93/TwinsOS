import { cardUpdateExpiry, cardUpdateUrlFor, generateCardUpdateToken } from "@/lib/card-update/token";
import { safeHexColor } from "@/lib/utils/safe-color";

// The service client's generated types don't cover this newer table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Mints a card-update link for a client and returns its URL. `db` must be a service-role client. */
export async function mintCardUpdateLink(
  db: Db,
  params: { orgId: string; clientId: string; createdBy?: string | null },
): Promise<string | null> {
  const { token, hash } = generateCardUpdateToken();
  const { error } = await db.from("card_update_tokens").insert({
    org_id: params.orgId,
    client_id: params.clientId,
    token_hash: hash,
    expires_at: cardUpdateExpiry().toISOString(),
    created_by: params.createdBy ?? null,
  });
  if (error) return null;
  return cardUpdateUrlFor(token);
}

export function cardUpdateButtonHtml(url: string, brandColor: string | null | undefined): string {
  return `<a href="${url}" style="color:#fff;background:${safeHexColor(brandColor, "#60ab45")};padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block">Update Your Card on File &rarr;</a>`;
}

const TAG_RE = /\[cardupdatelink(url)?\]/i;

/**
 * The [cardupdatelink] / [cardupdatelinkurl] merge values for one send — a fresh link
 * per call, minted only when some template actually uses a tag so ordinary emails don't
 * accumulate tokens. Returns {} when unused; blank values when the link couldn't be minted
 * (the tag then degrades to nothing rather than shipping literal "[tag]" text).
 */
export async function cardUpdateLinkVars(
  db: Db,
  params: { orgId: string; clientId: string; createdBy?: string | null; brandColor?: string | null; templates: Array<string | null | undefined> },
): Promise<{ html: Record<string, string>; text: Record<string, string> }> {
  if (!params.templates.some((t) => !!t && TAG_RE.test(t))) return { html: {}, text: {} };
  const url = await mintCardUpdateLink(db, params);
  return {
    html: { "[cardupdatelink]": url ? cardUpdateButtonHtml(url, params.brandColor) : "", "[cardupdatelinkurl]": url ?? "" },
    text: { "[cardupdatelink]": url ?? "", "[cardupdatelinkurl]": url ?? "" },
  };
}
