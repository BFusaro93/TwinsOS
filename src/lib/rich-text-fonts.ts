// Fonts offered by the rich-text editor. A fixed list (not free text) so the
// sanitizer can allowlist them and email/PDF output can map each to a safe
// stack / built-in PDF font.

export const RICH_TEXT_FONTS = [
  { label: "Arial", css: "Arial, Helvetica, sans-serif", pdf: "Helvetica" },
  { label: "Verdana", css: "Verdana, Geneva, sans-serif", pdf: "Helvetica" },
  { label: "Trebuchet MS", css: "'Trebuchet MS', sans-serif", pdf: "Helvetica" },
  { label: "Georgia", css: "Georgia, serif", pdf: "Times-Roman" },
  { label: "Times New Roman", css: "'Times New Roman', Times, serif", pdf: "Times-Roman" },
  { label: "Courier New", css: "'Courier New', Courier, monospace", pdf: "Courier" },
] as const;

export const RICH_TEXT_FONT_SIZES = [10, 12, 14, 16, 18, 24, 32] as const;

/** Returns the allowlisted font entry for a CSS font-family value, by its first family name. */
export function matchRichTextFont(family: string | null | undefined) {
  if (!family) return null;
  const first = family.split(",")[0].replace(/["']/g, "").trim().toLowerCase();
  return RICH_TEXT_FONTS.find((f) => f.label.toLowerCase() === first) ?? null;
}
