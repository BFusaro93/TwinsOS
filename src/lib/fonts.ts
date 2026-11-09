import localFont from "next/font/local";

/**
 * The app's fonts, self-hosted from src/fonts (both SIL Open Font License).
 *
 * They used to come from `next/font/google`, which downloads the CSS and font
 * files from Google Fonts during every production build. Vercel's build
 * machines intermittently get a response the loader can't parse, and the build
 * dies with `Cannot read properties of null (reading '1')` in next/font — it
 * failed two production deploys in a row on 2026-11-08 while the same fetch
 * from a laptop was fine. Committed files make the build independent of that.
 *
 * Each file is Google's latin subset of the variable font (one file covers
 * every weight). Characters outside it fall back to the system font.
 *
 * Declare fonts only here and import them; don't call localFont() in a page.
 */

/** Body text (was `Inter({ subsets: ["latin"] })` in the root layout). */
export const inter = localFont({
  src: "../fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

/** The Landscapt heading face. */
export const heading = localFont({
  src: "../fonts/plus-jakarta-sans-latin-var.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-heading",
});
