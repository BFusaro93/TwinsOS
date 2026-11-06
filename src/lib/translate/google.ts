/**
 * Google Cloud Translation (v2, REST) for crew-facing notes. The key lives in
 * GOOGLE_TRANSLATE_API_KEY (server only). Without it every call reports
 * `not_configured` so the crew screens can say translation isn't set up rather
 * than failing mysteriously.
 *
 * Only ever called with text a signed-in crew member is looking at, one note at
 * a time, and the apps cache each result on the device — a note is translated
 * once per phone per language, which keeps usage well inside Google's free
 * monthly allowance.
 */
export const MAX_TRANSLATE_CHARS = 4000;

export type TranslateTarget = "en" | "es";

export type TranslateResult =
  | { ok: true; translated: string; sourceLang: string }
  | { ok: false; reason: "not_configured" | "failed" };

export async function translateText(text: string, target: TranslateTarget): Promise<TranslateResult> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return { ok: false, reason: "not_configured" };
  try {
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text.slice(0, MAX_TRANSLATE_CHARS), target, format: "text" }),
      // A stuck upstream call must not hold a crew member's screen.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "failed" };
    const json = (await res.json()) as {
      data?: { translations?: { translatedText?: string; detectedSourceLanguage?: string }[] };
    };
    const first = json.data?.translations?.[0];
    if (!first?.translatedText) return { ok: false, reason: "failed" };
    return { ok: true, translated: decodeEntities(first.translatedText), sourceLang: first.detectedSourceLanguage ?? "" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/** The v2 API returns HTML entities (&#39; etc.) even for plain text. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
