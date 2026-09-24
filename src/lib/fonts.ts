import { Plus_Jakarta_Sans } from "next/font/google";

/**
 * The Landscapt heading face, declared exactly once for the whole app.
 *
 * Import this rather than calling Plus_Jakarta_Sans() in a page. Every
 * `next/font/google` call site is a separate Google Fonts fetch at build
 * time, and Next fires them together through a Promise.all — so 30-odd
 * identical declarations meant 30-odd concurrent requests from the build
 * machine. Google throttles a burst like that, and the loader regex-matches
 * whatever came back, so a throttled (empty) response makes the match null
 * and the build dies on `Cannot read properties of null (reading '1')` —
 * naming whichever page lost the race, which is why it looked random.
 *
 * One call site means one fetch, and the font is cached and shared across
 * every page that imports it.
 */
export const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});
