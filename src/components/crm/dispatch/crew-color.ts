/** Used when a crew has no color set, so every crew still reads as distinct. */
export const FALLBACK_CREW_COLORS = ["#15803d", "#0e7490", "#1d4ed8", "#a16207", "#7e22ce", "#be123c", "#0f766e", "#c2410c"];

export function crewColor(color: string | null | undefined, index: number): string {
  return color || FALLBACK_CREW_COLORS[index % FALLBACK_CREW_COLORS.length];
}

/** White or near-black text, whichever reads better on `hex`. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#111827" : "#ffffff";
}

/** `hex` blended into transparent at `pct`% — a soft tint that works in light and dark mode. */
export function tint(hex: string, pct: number): string {
  return `color-mix(in srgb, ${hex} ${pct}%, transparent)`;
}
