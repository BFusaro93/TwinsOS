/**
 * SMS keyword recognition for inbound texts (STOP / START / HELP).
 *
 * The keyword lists mirror what each org's A2P campaign registers with Twilio
 * (src/lib/twilio/provisioning.ts → submitCampaign uses these same arrays), so
 * what we honour here is what carriers were told we honour. The public
 * /legal/sms-terms page (an approved campaign's terms) only promises STOP and
 * HELP, which are both covered.
 *
 * Opt-out is deliberately broad — FCC 47 CFR 64.1200(a)(10) says a consumer
 * may revoke consent "by any reasonable means", and names OPT OUT / REVOKE
 * alongside STOP-style words:
 *   - every registered opt-out keyword, plus OPTOUT / OPT OUT / OPT-OUT / REVOKE;
 *   - short phrases built from a keyword plus filler ("STOP PLEASE",
 *     "UNSUBSCRIBE ME", "STOP TEXTING ME") count as the keyword itself;
 *   - a longer message that CONTAINS an unambiguous opt-out keyword (STOP,
 *     STOPALL, UNSUBSCRIBE, OPTOUT, REVOKE) as a word also opts the number out
 *     (owner decision), flagged as `contained` so staff can re-confirm;
 *     CANCEL / END / QUIT count only as the whole message.
 * Opt-in and HELP are deliberately narrow: only a message that IS the keyword.
 * "When will you start?" must never re-grant consent.
 */

/** Opt-out keywords registered on new campaigns (OptOutKeywords). */
export const REGISTERED_OPT_OUT_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"] as const;

/**
 * Opt-in keywords registered on campaigns (OptInKeywords). YES is deliberately
 * NOT registered (owner decision, round 10): clients reply YES to unrelated
 * texts ("Reply YES to confirm your visit"), which would silently re-grant
 * consent to someone who texted STOP. Registration and the app now match.
 */
export const REGISTERED_OPT_IN_KEYWORDS = ["START", "UNSTOP"] as const;
const HONOURED_OPT_IN_KEYWORDS = new Set<string>(REGISTERED_OPT_IN_KEYWORDS);

/**
 * Registered opt-out words that are also everyday English ("cancel my Tuesday
 * visit", "see you at the end", "I quit smoking"). They opt out only when they
 * are the WHOLE message — never as part of a longer one (owner decision,
 * round 10). The unambiguous words (STOP, STOPALL, UNSUBSCRIBE, OPTOUT,
 * REVOKE) still opt out wherever they appear.
 */
const WHOLE_MESSAGE_ONLY_OPT_OUT = new Set(["CANCEL", "END", "QUIT"]);

/** Help keywords registered on campaigns (HelpKeywords). */
export const REGISTERED_HELP_KEYWORDS = ["HELP", "INFO"] as const;

const OPT_OUT = new Set<string>(REGISTERED_OPT_OUT_KEYWORDS);
const HELP = new Set<string>(REGISTERED_HELP_KEYWORDS);

/** Words that don't change the meaning of a keyword ("STOP PLEASE", "UNSUBSCRIBE ME"). */
const FILLER = new Set([
  "PLEASE", "PLS", "PLZ", "ME", "MY", "NUMBER", "NOW", "THANKS", "THANK", "YOU", "THX", "TY",
  "TEXT", "TEXTS", "TEXTING", "MESSAGE", "MESSAGES", "MESSAGING", "SMS", "SENDING", "SEND",
  "IT", "THIS", "THAT", "ALL", "FROM", "TO", "THE", "LIST", "OF", "US", "OK", "OKAY", "NO", "MORE", "ANYMORE",
]);

export type SmsKeywordKind = "opt_out" | "opt_in" | "help" | "none";

export interface SmsKeywordResult {
  kind: SmsKeywordKind;
  /** The keyword that decided it (uppercase), e.g. "STOP", "OPTOUT". */
  keyword: string | null;
  /**
   * opt_out only: true when the keyword was found inside a longer message
   * rather than the message being the keyword (plus filler). Staff should
   * re-confirm these.
   */
  contained: boolean;
}

/** Uppercases and strips punctuation, quotes, emoji and extra whitespace. Keeps letters/digits. */
export function normalizeSmsText(body: string): string {
  return (
    body
      .normalize("NFKC")
      .toUpperCase()
      // Apostrophes/quotes vanish ("DON'T" -> "DONT", '"STOP"' -> "STOP").
      .replace(/['‘’‚‛′`"“”„″]/g, "")
      // OPT-OUT / OPT OUT / OPT_OUT -> OPTOUT, STOP ALL -> STOPALL.
      .replace(/\bOPT[\s\-_.]*OUT\b/g, "OPTOUT")
      .replace(/\bSTOP[\s\-_.]*ALL\b/g, "STOPALL")
      .replace(/\bUN[\s\-_.]+(SUBSCRIBE|STOP)\b/g, "UN$1")
      // Everything that isn't a letter or digit (punctuation, emoji, hyphens) is a word break.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/** Classifies an inbound text body. See the module comment for the rules. */
export function classifySmsKeyword(body: string): SmsKeywordResult {
  const normalized = normalizeSmsText(body);
  if (!normalized) return { kind: "none", keyword: null, contained: false };
  const words = normalized.split(" ");

  // The whole message is one keyword.
  if (words.length === 1) {
    const w = words[0];
    if (OPT_OUT.has(w)) return { kind: "opt_out", keyword: w, contained: false };
    if (HONOURED_OPT_IN_KEYWORDS.has(w)) return { kind: "opt_in", keyword: w, contained: false };
    if (HELP.has(w)) return { kind: "help", keyword: w, contained: false };
    return { kind: "none", keyword: null, contained: false };
  }

  // Opt-out anywhere in the message, as a whole word — unambiguous words only
  // (CANCEL / END / QUIT count only as the whole message, handled above).
  const optOutWord = words.find((w) => OPT_OUT.has(w) && !WHOLE_MESSAGE_ONLY_OPT_OUT.has(w));
  if (optOutWord) {
    // "STOP PLEASE", "PLEASE STOP", "UNSUBSCRIBE ME", "STOP TEXTING ME":
    // nothing but the keyword(s) and filler — as clear as a bare STOP.
    const onlyFiller = words.every((w) => OPT_OUT.has(w) || FILLER.has(w));
    return { kind: "opt_out", keyword: optOutWord, contained: !onlyFiller };
  }

  return { kind: "none", keyword: null, contained: false };
}

/** The note recorded on the ticket/activity when a longer message tripped the opt-out. */
export function containedOptOutNote(keyword: string): string {
  return `Opted out because the message contained '${keyword}' — re-confirm if this was a misread`;
}
