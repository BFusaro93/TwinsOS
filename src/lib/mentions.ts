// @mention token format shared between the comment input (MentionTextarea)
// and comment display (CommentsSection): `@[Display Name](profileId)`.
// Kept as a plain embedded token in `body` (not a separate rich-text format)
// so comments stay simple `text` columns — parsing happens at render/submit
// time instead.
const MENTION_TOKEN_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

export function mentionToken(name: string, userId: string): string {
  return `@[${name}](${userId})`;
}

/** All distinct profile ids mentioned in a comment body. */
export function extractMentionedUserIds(body: string): string[] {
  const ids = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN_RE)) {
    ids.add(match[2]);
  }
  return [...ids];
}

export type MentionSegment =
  | { type: "text"; content: string }
  | { type: "mention"; content: string; userId: string };

/** Splits a comment body into plain-text and mention segments for rendering. */
export function parseMentionSegments(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  MENTION_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_RE.exec(body))) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: body.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mention", content: match[1], userId: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: "text", content: body.slice(lastIndex) });
  }
  return segments;
}
