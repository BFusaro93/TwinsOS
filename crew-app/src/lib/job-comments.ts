import { notesToPlainText } from '@/lib/rich-notes';
import type { CrewStop } from '@/lib/types';

interface RawJobComment {
  id?: string;
  text?: string;
  content?: string;
  createdAt?: string;
}

/**
 * The comments left on this stop's visits (dispatcher and crew comments),
 * newest first, as plain text. Shown in the amber box on the schedule card; the
 * job's own (often long) notes are read inside the stop, behind the
 * acknowledge button.
 */
export function stopJobComments(stop: CrewStop): string[] {
  const seen = new Set<string>();
  const rows: { text: string; at: string }[] = [];
  for (const v of stop.visits) {
    if (!Array.isArray(v.jobComments)) continue;
    for (const raw of v.jobComments as RawJobComment[]) {
      if (!raw || typeof raw !== 'object') continue;
      const text = notesToPlainText(raw.text ?? raw.content ?? '').trim();
      if (!text) continue;
      const key = raw.id ?? `${raw.createdAt ?? ''}|${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ text, at: raw.createdAt ?? '' });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at)).map((r) => r.text);
}
