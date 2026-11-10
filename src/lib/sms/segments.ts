/**
 * SMS segment counting — what carriers bill for and what the SMS add-on's
 * usage counts (organization_sms_usage.count is SEGMENTS, not messages).
 *
 * A body that fits the GSM-7 alphabet holds 160 characters in one segment and
 * 153 per segment once split (the concatenation header takes 7). Anything
 * outside GSM-7 — emoji, curly quotes, most accented letters — forces UCS-2:
 * 70 in one segment, 67 per segment once split. Characters in the GSM-7
 * extension table ({ } [ ] ~ \ | ^ € and form feed) cost two septets.
 *
 * Twilio's own num_segments (on the send response) is authoritative; this is
 * the fallback when it's missing and the live counter in the composer.
 */

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "\f^{}\\[~]|€";

const BASIC = new Set(Array.from(GSM7_BASIC));
const EXTENDED = new Set(Array.from(GSM7_EXTENDED));

export interface SmsSegmentInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the carrier counts them (septets for GSM-7, UTF-16 units for UCS-2). */
  units: number;
  segments: number;
  /** Characters per segment at the current encoding/length. */
  perSegment: number;
}

export function smsSegmentInfo(body: string): SmsSegmentInfo {
  let gsm = true;
  let septets = 0;
  for (const ch of Array.from(body)) {
    if (BASIC.has(ch)) septets += 1;
    else if (EXTENDED.has(ch)) septets += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (gsm) {
    const perSegment = septets <= 160 ? 160 : 153;
    return { encoding: "GSM-7", units: septets, segments: septets === 0 ? 0 : Math.ceil(septets / perSegment), perSegment };
  }
  // UCS-2 counts UTF-16 code units: an emoji outside the BMP is two.
  const units = body.length;
  const perSegment = units <= 70 ? 70 : 67;
  return { encoding: "UCS-2", units, segments: units === 0 ? 0 : Math.ceil(units / perSegment), perSegment };
}

export function smsSegmentCount(body: string): number {
  return smsSegmentInfo(body).segments;
}
