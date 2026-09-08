import type { Metadata, Viewport } from "next";
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

// Next 15 only reads viewport/colorScheme/themeColor from this export —
// declaring them inside `metadata` (as this file used to) silently emits
// nothing, which is why the served HTML carried Next's default viewport
// tag and no theme-color at all.
//
// Deliberately NOT carrying over the old `maximum-scale=1`: it was never
// actually in effect, and switching it on now would newly block pinch-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: "#ffffff",
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
    // Single entry on purpose: /brand-icon.ico is a route handler that
    // picks the tile colour from the User-Agent — the brand's dark green
    // for Chromium/Firefox, white for Safari. See that route for why the
    // branch exists (Safari draws a contrast outline around favicons too
    // dark for its tab bar) and why it can't be done with static links.
    // The .ico carries 16/32/48/128/256 frames, so no per-size PNG links
    // are needed; those were only ever added to chase a resize theory
    // that turned out to be wrong.
    //
    // icon.svg stays off this list — it's the dark-green rounded mark,
    // right for the JSON-LD logo above, but Safari picking it as a
    // favicon would put the ring straight back.
    icon: [{ url: "/brand-icon.ico", sizes: "any" }],
    shortcut: "/brand-icon.ico",
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
