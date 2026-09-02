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

/** Renders a comment body as plain text, replacing mention tokens with just
 *  the mentioned person's name — for contexts that can't render styled
 *  segments (notification text/emails, PDF export). */
export function stripMentionTokens(body: string): string {
  return body.replace(MENTION_TOKEN_RE, (_full, name: string) => `@${name}`);
}

export interface MentionRange {
  rawStart: number;
  rawEnd: number;
  dispStart: number;
  dispEnd: number;
  id: string;
  name: string;
}

/** Converts a raw comment body (with embedded @[Name](id) tokens) into plain
 *  "@Name" text for editing, plus the ranges needed to translate edits back
 *  into the raw token format via `applyDisplayEdit`. Used so the compose box
 *  never shows the raw markdown/id to the user while typing. */
export function toDisplay(raw: string): { display: string; ranges: MentionRange[] } {
  const ranges: MentionRange[] = [];
  let display = "";
  let lastIndex = 0;
  MENTION_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_TOKEN_RE.exec(raw))) {
    display += raw.slice(lastIndex, match.index);
    const dispStart = display.length;
    const displayToken = `@${match[1]}`;
    display += displayToken;
    ranges.push({
      rawStart: match.index,
      rawEnd: match.index + match[0].length,
      dispStart,
      dispEnd: dispStart + displayToken.length,
      id: match[2],
      name: match[1],
    });
    lastIndex = match.index + match[0].length;
  }
  display += raw.slice(lastIndex);
  return { display, ranges };
}

/** Translates a cursor/selection position in display text back to the
 *  corresponding position in the raw text. `dispPos` must fall on a mention
 *  boundary or in plain text — never inside a mention's display range. */
export function displayPositionToRaw(dispPos: number, ranges: MentionRange[]): number {
  let rawPos = dispPos;
  for (const r of ranges) {
    if (r.dispEnd <= dispPos) {
      rawPos += (r.rawEnd - r.rawStart) - (r.dispEnd - r.dispStart);
    }
  }
  return rawPos;
}

/** Reconstructs the raw value (with full @[Name](id) tokens) after the user
 *  edits the plain "@Name" display text in a controlled textarea. An edit
 *  that touches any part of a mention removes that mention whole — a
 *  mention can be deleted but never partially rewritten. */
export function applyDisplayEdit(
  prevRaw: string,
  prevDisplay: string,
  prevRanges: MentionRange[],
  nextDisplay: string,
): string {
  const maxCommon = Math.min(prevDisplay.length, nextDisplay.length);
  let p = 0;
  while (p < maxCommon && prevDisplay[p] === nextDisplay[p]) p++;

  let s = 0;
  const maxSuffix = maxCommon - p;
  while (
    s < maxSuffix &&
    prevDisplay[prevDisplay.length - 1 - s] === nextDisplay[nextDisplay.length - 1 - s]
  ) {
    s++;
  }

  let oldStart = p;
  let oldEnd = prevDisplay.length - s;

  // Expand the deleted region to fully cover any mention the edit
  // partially overlaps.
  for (let i = 0; i < 3; i++) {
    let changed = false;
    for (const r of prevRanges) {
      if (r.dispStart < oldEnd && r.dispEnd > oldStart) {
        if (r.dispStart < oldStart) { oldStart = r.dispStart; changed = true; }
        if (r.dispEnd > oldEnd) { oldEnd = r.dispEnd; changed = true; }
      }
    }
    if (!changed) break;
  }

  const rawCutStart = displayPositionToRaw(oldStart, prevRanges);
  const rawCutEnd = displayPositionToRaw(oldEnd, prevRanges);
  const inserted = nextDisplay.slice(p, nextDisplay.length - s);
  return prevRaw.slice(0, rawCutStart) + inserted + prevRaw.slice(rawCutEnd);
}
