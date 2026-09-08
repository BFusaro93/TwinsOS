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
    // icon.svg's <link> is intentionally dropped (see below for why the
    // halo persisted even after that change).
    //
    // The white ring in Safari's dark-mode tab strip persisted even with
    // only favicon.ico/.png in play, despite every frame of both files
    // being pixel-inspected clean (alpha fades transparent -> correct
    // brand green, never toward white, and no alpha=0 pixel stores a
    // light RGB that could bleed through a resize). The remaining
    // explanation: Safari was resizing our single 128px/256px source down
    // to its own tab-icon size itself, and resizing straight (non-
    // premultiplied) alpha at a hard transparent/opaque edge is a classic
    // source of light "ringing" fringe — invisible against light browser
    // chrome (Chrome/Firefox tabs), visible against Safari's dark tab.
    // Fix: ship pre-rendered, premultiplied-alpha-correct PNGs at the
    // exact sizes Safari's tab strip actually needs (16/32/48/64), so it
    // never has to resize our source itself. Filenames are cache-busted
    // (v3) since Safari's favicon cache is a separate on-disk store that
    // survives a normal reload or even Safari's own "Empty Caches".
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16v3.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32v3.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-48v3.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-64v3.png", type: "image/png", sizes: "64x64" },
      { url: "/favicon.png", type: "image/png", sizes: "128x128" },
    ],
    shortcut: "/favicon.ico",
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
