/**
 * Converts pixel sizes to rem at build time so they follow the root font size.
 *
 * Why: the app's display-size setting (80% / 90% / 100%, see
 * src/lib/hooks/use-display-size.ts) works by scaling <html>'s font size.
 * Tailwind's named sizes are rem-based and scale with it, but ~1,400 arbitrary
 * values (`text-[10px]`, `w-[580px]`, `max-w-[1160px]` …) and plain-px rules in
 * globals.css are fixed — so small labels, pills and fixed-width panels stayed
 * full size while everything around them shrank.
 *
 * At the default 16px root font size the output is pixel-identical (n px =
 * n/16 rem), so nothing changes except when the root size does.
 *
 * Deliberately scoped:
 *  - only size/spacing/radius properties — borders, outlines, shadows and
 *    transforms stay in px (they should stay hairline-thin);
 *  - values of 1px or less are kept;
 *  - media queries are untouched (they never use the root font size anyway).
 */
const PROPS =
  /^(font-size|line-height|letter-spacing|width|height|min-width|max-width|min-height|max-height|padding(-[a-z]+)*|margin(-[a-z]+)*|gap|row-gap|column-gap|top|right|bottom|left|inset(-[a-z]+)*|flex-basis|grid-template-(columns|rows)|grid-auto-(columns|rows)|border-radius|border-(top|bottom)-(left|right)-radius|text-indent)$/;

const PX = /(-?\d*\.?\d+)px\b/g;

const plugin = () => ({
  postcssPlugin: "px-to-rem",
  Declaration(decl) {
    if (!PROPS.test(decl.prop) || !decl.value.includes("px") || decl.value.includes("url(")) return;
    const next = decl.value.replace(PX, (match, num) => {
      const n = parseFloat(num);
      if (!Number.isFinite(n) || Math.abs(n) <= 1) return match;
      return `${parseFloat((n / 16).toFixed(4))}rem`;
    });
    if (next !== decl.value) decl.value = next;
  },
});
plugin.postcss = true;

module.exports = plugin;
