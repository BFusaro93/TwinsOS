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
    // These assets are deliberately FULL-BLEED and FULLY OPAQUE (no
    // rounded corners, zero alpha) to kill a white ring that Safari drew
    // around the icon in its tab strip and Favorites bar.
    //
    // The ring was never in the asset — every frame of every candidate
    // was scanned and contains no white pixel at any alpha. What gave it
    // away: adding transparent padding around the mark made the white
    // BIGGER, not smaller. That's the signature of a light backplate
    // drawn behind the icon at full canvas size — the white isn't around
    // our icon, it's behind it, showing through wherever we're
    // transparent. Our rounded corners were 9-17% transparent pixels
    // (higher share at small sizes), so the plate peeked out as a ring.
    // Safari's address-bar site icon draws no such plate, which is why
    // the same bytes looked clean there, and every comparison favicon in
    // the tab strip that rendered clean (AmEx, Gusto, DocuSign,
    // QuickBooks, SiteOne) is likewise a full-bleed opaque square.
    //
    // So: no transparency, nothing to show through. icon.svg is left off
    // this list for the same reason — its rounded rect (rx="11") is
    // transparency by definition. It stays on disk for the JSON-LD logo
    // reference above, where the rounded mark is still the right look.
    icon: [
      { url: "/favicon-v5.ico", sizes: "any" },
      { url: "/favicon-16v5.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32v5.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48v5.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-64v5.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon-128v5.png", type: "image/png", sizes: "128x128" },
    ],
    shortcut: "/favicon-v5.ico",
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
