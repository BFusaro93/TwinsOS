import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/providers";
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE } from "@/lib/seo";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  brand: [
    { "@type": "Brand", name: "Landscapt" },
    { "@type": "Brand", name: "Equipt" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Landscapt & Equipt",
    template: "%s",
  },
  description: "CRM, field service, work orders, purchasing & asset management",
  openGraph: {
    title: "Landscapt & Equipt",
    description: "CRM, field service, work orders, purchasing & asset management",
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: DEFAULT_OG_IMAGE }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Landscapt & Equipt",
    description: "CRM, field service, work orders, purchasing & asset management",
    images: [DEFAULT_OG_IMAGE],
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
  // Previously undeclared — with no color-scheme meta, Safari doesn't know
  // this origin supports dark rendering and may default any UI plate it
  // draws behind transparent regions (tab/Favorites-bar favicon included)
  // to a light background. Every comparison site in the tab strip that
  // rendered its favicon cleanly is a large, well-established product —
  // plausibly because they already declare this. Untested until now since
  // every prior attempt at this bug stayed at the asset-pixel level.
  colorScheme: "dark light",
  themeColor: "#005642",
  icons: {
    // Explicit list, not the app/icon.* file convention — Next only ever
    // emits a single <link rel="icon"> for that convention, silently
    // picking one format when both a .svg and .png exist for the same
    // name. Listing both here generates a <link> for each, so browsers
    // that render SVG favicons fine (Chrome, Firefox) get the scalable
    // rounded mark, and browsers with SVG-favicon quirks or link-tag
    // resolution issues (Safari) have a classic .ico/.png fallback —
    // Safari has historically favored (and sometimes required) a plain
    // favicon.ico at the domain root over any <link> declaration.
    //
    // The mark sits on a WHITE tile here, not the brand's forest green,
    // and that is load-bearing — it's what stops Safari drawing a light
    // ring around the icon in its tab strip and Favorites bar.
    //
    // The ring was never a pixel in our asset (every frame of every
    // candidate was scanned: no white at any alpha). It's the contrast
    // outline macOS/Safari adds to a favicon too dark to read against
    // the dark tab bar. Measured edge luminance, tab bar ~50: ours on
    // #005642 was 66 — nearly invisible — while every icon that rendered
    // clean sat far above it (Amazon 124, AmEx 109). On white we measure
    // 255, roughly double Amazon's margin.
    //
    // This also explains what misled three earlier attempts: transparency
    // was never the trigger (Amazon has rounded corners and renders
    // clean), so pixel-purity checks, exact-size PNGs, and full opacity
    // all failed, and padding made it worse only because the outline is
    // drawn at the icon's bounding box.
    //
    // icon.svg is left off this list — it's still the dark-green rounded
    // mark, which is right for the JSON-LD logo above but would
    // reintroduce the ring if Safari picked it as a favicon.
    icon: [
      { url: "/favicon-v6.ico", sizes: "any" },
      { url: "/favicon-16v6.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32v6.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48v6.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-64v6.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon-128v6.png", type: "image/png", sizes: "128x128" },
    ],
    shortcut: "/favicon-v6.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
