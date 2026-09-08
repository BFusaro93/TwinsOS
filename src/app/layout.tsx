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
    // icon.svg's <link> is intentionally dropped (see below).
    //
    // A white ring showed up around the icon in Safari's tab strip and
    // Favorites bar, but NOT in Safari's address-bar site icon — same
    // bytes, rendered cleanly in one Safari surface and haloed in two
    // others, which ruled out a bad pixel in the source file (every
    // frame of every candidate asset was inspected: alpha always fades
    // transparent -> correct brand green, never toward white) and a
    // from-source resize artifact (the halo persisted even after adding
    // pre-rendered 16/32/48/64px PNGs, v3, so Safari resizing our source
    // itself wasn't it either).
    // What made it click: other apps' dark/saturated tab icons (e.g.
    // AmEx's blue square) don't show this ring, but ours — a rounded
    // square whose fill runs almost to the edge of the canvas (only a
    // ~2% margin, per icon.svg's rect x="1" y="1" of a 48x48 viewBox) —
    // does. Safari's tab/Favorites-bar chrome appears to draw its own
    // subtle frame/shadow at the icon's outer bounding box; icons with
    // real transparent padding around their artwork have that frame land
    // in the transparent gutter (invisible against the dark tab), while
    // ours had it land right on our opaque edge. Fix: re-rendered every
    // favicon asset with ~20% transparent margin (content scaled to 80%
    // of the canvas, centered) instead of touching the edges — v4,
    // cache-busted again since Safari's favicon cache is a separate
    // on-disk store that survives a normal reload or "Empty Caches".
    icon: [
      { url: "/favicon-v4.ico", sizes: "any" },
      { url: "/favicon-16v4.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32v4.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48v4.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-64v4.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon-128v4.png", type: "image/png", sizes: "128x128" },
    ],
    shortcut: "/favicon-v4.ico",
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
