import { DOC_SECTIONS, FAQ_CATEGORIES } from "@/lib/docs-content";
import { DOC_GUIDES } from "@/lib/docs-guides";
import guideContent from "@/lib/docs-guides-content.json";
import dataDictionary from "@/lib/data-dictionary.json";

export interface DocSearchResult {
  type: "article" | "guide" | "faq";
  title: string;
  /** Where this result lives in the app, e.g. "/settings/support#requisitions" or "/settings/support/purchase-orders-guide". */
  path: string;
  /** A short snippet of the matching text, for a quick preview before fetching the full guide. */
  excerpt: string;
}

export interface DataDictionaryEntry {
  key: string;
  section?: string;
  name?: string;
  description?: string;
  notes?: string[];
  dataset?: string;
  columns?: string[];
}

export interface DataDictionarySearchResult {
  name: string;
  description: string;
  notes: string[];
  dataset?: string;
  columns: string[];
}

const STOPWORDS = new Set([
  "a", "an", "the", "how", "do", "does", "did", "is", "are", "was", "were", "be", "i", "to", "for",
  "of", "in", "on", "at", "by", "what", "when", "where", "why", "which", "who", "can", "could",
  "should", "would", "will", "with", "and", "or", "if", "so", "my", "me", "we", "it", "its", "this",
  "that", "there", "they", "then", "than", "get", "gets", "have", "has", "had", "just", "also",
  "about", "from", "into", "up", "out", "not", "no", "yes", "but", "any", "some", "need", "want",
]);

/**
 * Words people use for a thing that the docs call something else. Each query
 * token expands to its listed alternatives, so "does it sync" finds the page
 * that says "attach under Linked Login", and "master settings" finds
 * "Master Account Settings". Keep entries to genuine synonyms — an
 * over-broad expansion just drags unrelated passages into the results.
 */
const SYNONYMS: Record<string, string[]> = {
  sync: ["link", "attach", "connect", "automatic"],
  linked: ["link", "attach", "connect"],
  link: ["attach", "connect", "linked"],
  unlink: ["link", "attach", "remove"],
  attach: ["link", "connect"],
  connect: ["link", "integration"],
  master: ["settings", "organization", "account"],
  account: ["login", "user"],
  login: ["account", "user", "sign"],
  signin: ["login", "sign"],
  user: ["login", "account", "role"],
  delete: ["remove", "archive", "deactivate"],
  remove: ["delete", "archive"],
  cancel: ["void", "delete", "remove"],
  email: ["send", "message", "notification"],
  text: ["sms", "message"],
  sms: ["text", "message"],
  price: ["rate", "cost", "amount"],
  pricing: ["rate", "cost", "amount", "price"],
  schedule: ["dispatch", "visit", "calendar"],
  employee: ["staff", "worker", "team"],
  staff: ["employee", "worker"],
  customer: ["client"],
  client: ["customer"],
  bill: ["invoice", "charge"],
  invoice: ["bill", "charge"],
  permission: ["role", "access"],
  access: ["permission", "role"],
  profit: ["margin", "cost", "costing", "revenue"],
  profitability: ["profit", "margin", "cost", "costing", "revenue"],
  profitable: ["profit", "margin", "cost", "costing"],
  create: ["add", "new"],
  add: ["create", "new"],
};

/** Light suffix stripping so "crews"/"linked"/"linking" all meet at "crew"/"link". */
function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith("es")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

function rawWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
}

/** Stemmed content words of free text (no synonym expansion — used for indexing). */
function indexTokens(text: string): string[] {
  return rawWords(text).filter((w) => !STOPWORDS.has(w)).map(stem);
}

/** Stemmed content words of a query, plus synonym expansions (flagged so they count for less). */
function queryTokens(query: string): { token: string; weight: number }[] {
  const out = new Map<string, number>();
  for (const w of rawWords(query)) {
    if (STOPWORDS.has(w)) continue;
    out.set(stem(w), 1);
    for (const syn of SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? []) {
      const st = stem(syn);
      if (!out.has(st)) out.set(st, 0.5);
    }
  }
  return [...out.entries()].map(([token, weight]) => ({ token, weight }));
}

function tokenize(query: string): string[] {
  return queryTokens(query).map((t) => t.token);
}

function score(text: string, tokens: string[]): number {
  const have = new Set(indexTokens(text));
  return tokens.reduce((sum, t) => sum + (have.has(t) ? 1 : 0), 0);
}

// ── Passage index ─────────────────────────────────────────────────────────────

interface Passage {
  type: DocSearchResult["type"];
  /** Document key — passages of one guide/article/FAQ share it. */
  docId: string;
  title: string;
  path: string;
  /** Position within its document, so neighbours can be merged. */
  order: number;
  text: string;
  tf: Map<string, number>;
  length: number;
}

const PASSAGE_TARGET_CHARS = 700;

/**
 * Splits prose into ~700-char passages on sentence boundaries, repeating the
 * last sentence of each passage at the start of the next so an answer that
 * straddles a boundary still lands whole in at least one passage.
 */
function splitPassages(text: string): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/);
  const passages: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const sentence of sentences) {
    if (size + sentence.length > PASSAGE_TARGET_CHARS && current.length > 0) {
      passages.push(current.join(" "));
      current = [current[current.length - 1]];
      size = current[0].length;
    }
    current.push(sentence);
    size += sentence.length + 1;
  }
  if (current.length > 0) passages.push(current.join(" "));
  return passages;
}

function makePassage(
  base: Pick<Passage, "type" | "docId" | "title" | "path">,
  order: number,
  text: string
): Passage {
  const tf = new Map<string, number>();
  const tokens = indexTokens(`${base.title} ${text}`);
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { ...base, order, text, tf, length: tokens.length };
}

let passageIndex: { passages: Passage[]; df: Map<string, number>; avgLength: number } | null = null;

function getPassageIndex() {
  if (passageIndex) return passageIndex;
  const passages: Passage[] = [];

  for (const section of DOC_SECTIONS) {
    for (const article of section.articles) {
      const stepsText = article.steps.map((s) => `${s.step}: ${s.detail}`).join(" ");
      const base = {
        type: "article" as const,
        docId: `article:${section.id}:${article.id}`,
        title: article.title,
        path: `/settings/support#${section.id}:${article.id}`,
      };
      splitPassages(`${article.summary} ${stepsText}`).forEach((text, i) => passages.push(makePassage(base, i, text)));
    }
  }

  for (const guide of DOC_GUIDES) {
    const body = (guideContent as Record<string, string>)[guide.slug] ?? "";
    const base = {
      type: "guide" as const,
      docId: `guide:${guide.slug}`,
      title: guide.title,
      path: `/settings/support/${guide.slug}`,
    };
    splitPassages(`${guide.description} ${body}`).forEach((text, i) => passages.push(makePassage(base, i, text)));
  }

  // One passage per FAQ: they are already question-sized, and splitting
  // would separate the answer from the question that names the topic.
  let faqIndex = 0;
  for (const category of FAQ_CATEGORIES) {
    for (const faq of category.items) {
      passages.push(
        makePassage(
          { type: "faq", docId: `faq:${faqIndex++}`, title: faq.q, path: "/settings/support#faq" },
          0,
          faq.a
        )
      );
    }
  }

  const df = new Map<string, number>();
  let totalLength = 0;
  for (const p of passages) {
    totalLength += p.length;
    for (const t of p.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  }
  passageIndex = { passages, df, avgLength: totalLength / Math.max(passages.length, 1) };
  return passageIndex;
}

/** BM25 over passages, with a bonus when a query word is in the document's title. */
function rankPassages(query: string): (Passage & { score: number })[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  const { passages, df, avgLength } = getPassageIndex();
  const n = passages.length;
  const k1 = 1.4;
  const b = 0.75;

  const ranked: (Passage & { score: number })[] = [];
  for (const p of passages) {
    let total = 0;
    let matched = 0;
    for (const { token, weight } of tokens) {
      const tf = p.tf.get(token);
      if (!tf) continue;
      matched++;
      const docFreq = df.get(token) ?? 0;
      const idf = Math.log(1 + (n - docFreq + 0.5) / (docFreq + 0.5));
      total += weight * idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * p.length) / avgLength)));
    }
    if (total <= 0) continue;
    // Passages that hit several distinct query words beat ones that hit a
    // single word many times.
    total *= 1 + 0.15 * (matched - 1);
    ranked.push({ ...p, score: total });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * The passages most relevant to a question, as the text the Ask AI prompt
 * should read — whole passages rather than a 300-char snippet around the first
 * keyword, because the snippet approach is how the answer can sit in the
 * index and still never reach the model.
 *
 * `maxChars` bounds the prompt size; at most `perDoc` passages come from one
 * guide so a single long guide can't crowd out the others.
 */
export function searchDocPassages(
  query: string,
  { limit = 8, maxChars = 9000, perDoc = 3 }: { limit?: number; maxChars?: number; perDoc?: number } = {}
): DocSearchResult[] {
  const picked: (Passage & { score: number })[] = [];
  const perDocCount = new Map<string, number>();
  let chars = 0;
  for (const p of rankPassages(query)) {
    if (picked.length >= limit) break;
    const used = perDocCount.get(p.docId) ?? 0;
    if (used >= perDoc) continue;
    if (chars + p.text.length > maxChars && picked.length > 0) continue;
    picked.push(p);
    perDocCount.set(p.docId, used + 1);
    chars += p.text.length;
  }
  return picked.map((p) => ({ type: p.type, title: p.title, path: p.path, excerpt: p.text }));
}

/**
 * Full-text search over both tiers of in-app help content: the short
 * Support articles (src/lib/docs-content.ts — structured step-by-step data)
 * and the long-form Docs guides (src/lib/docs-guides.ts for metadata,
 * src/lib/docs-guides-content.json for body text — generated by
 * scripts/build-docs-index.mjs since guide pages are freeform JSX, not
 * structured data; re-run that script after editing a guide).
 *
 * BM25 over ~700-char passages with light stemming and synonym expansion,
 * not embeddings — good enough for a docs corpus this size, and avoids an
 * external dependency/API call. One result per document: its best passage.
 */
export function searchDocs(query: string, limit = 5): DocSearchResult[] {
  const seen = new Set<string>();
  const results: DocSearchResult[] = [];
  for (const p of rankPassages(query)) {
    if (seen.has(p.docId)) continue;
    seen.add(p.docId);
    results.push({ type: p.type, title: p.title, path: p.path, excerpt: p.text });
    if (results.length >= limit) break;
  }
  return results;
}

/** A staff-written answer to a question Ask AI previously could not answer. */
export interface StaffAnswer {
  question: string;
  resolution: string;
}

/**
 * Ranks resolved Ask AI questions against a new one by shared content words,
 * so an answer a staff member wrote once is reused for every later asker of
 * the same thing. Needs at least two shared words (or all of a very short
 * question's words) so a single common word like "invoice" can't pull in an
 * unrelated answer.
 */
export function matchStaffAnswers(query: string, answers: StaffAnswer[], limit = 3): StaffAnswer[] {
  const wanted = new Set(queryTokens(query).filter((t) => t.weight === 1).map((t) => t.token));
  if (wanted.size === 0) return [];
  const scored: { answer: StaffAnswer; hits: number }[] = [];
  for (const answer of answers) {
    const have = new Set(indexTokens(`${answer.question} ${answer.resolution}`));
    let hits = 0;
    for (const t of wanted) if (have.has(t)) hits++;
    if (hits >= Math.min(2, wanted.size)) scored.push({ answer, hits });
  }
  return scored
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit)
    .map((s) => s.answer);
}

/**
 * Full-text search over the data dictionary (src/lib/data-dictionary.json,
 * generated by scripts/build-data-dictionary.mjs from the Report Center's
 * prebuilt report definitions in src/lib/reports/definitions/*.ts).
 *
 * This is what lets the Ask AI support widget answer "is X actually
 * tracked" questions from the real column-level data model instead of only
 * from guide prose, which can go stale. Re-run the build script after
 * editing a report definition; this function just reads the committed JSON.
 */
export function searchDataDictionary(query: string, limit = 5): DataDictionarySearchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const entries = dataDictionary as DataDictionaryEntry[];
  const results: (DataDictionarySearchResult & { score: number })[] = [];

  for (const entry of entries) {
    const name = entry.name ?? entry.key;
    const description = entry.description ?? "";
    const notes = entry.notes ?? [];
    const columns = entry.columns ?? [];
    const s =
      score(name, tokens) * 3 +
      score(description, tokens) * 2 +
      score(notes.join(" "), tokens) * 2 +
      score(columns.join(" "), tokens);
    if (s > 0) {
      results.push({ name, description, notes, dataset: entry.dataset, columns, score: s });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...r }) => r);
}

/** Full body text of one long-form guide, for a get_guide follow-up after search_docs points at it. */
export function getGuideContent(slug: string): { title: string; description: string; content: string } | null {
  const guide = DOC_GUIDES.find((g) => g.slug === slug);
  if (!guide) return null;
  return {
    title: guide.title,
    description: guide.description,
    content: (guideContent as Record<string, string>)[slug] ?? "",
  };
}
