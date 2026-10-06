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
// Pinch-zoom is deliberately left enabled (WCAG 1.4.4) — never add
// `maximum-scale` or `user-scalable=no` here. iOS's focus auto-zoom is
// stopped instead by keeping form fields at 16px on touch (see globals.css),
// and the double-tap delay by `touch-action: manipulation`.
//
// `viewportFit: "cover"` lets the page extend under the notch / home bar so
// the standalone (home-screen) app is edge to edge; the shell pads itself
// with env(safe-area-inset-*) so nothing interactive sits under them.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
  // Home-screen launch on iOS (Android reads manifest.ts). No service worker
  // on purpose — installability doesn't need one and we don't want stale
  // cached app shells.
  appleWebApp: {
    capable: true,
    title: "Landscapt",
    statusBarStyle: "default",
  },
  // Next emits the modern `mobile-web-app-capable`; older iOS only reads the
  // apple-prefixed one, so ship both.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    // One entry, one static .ico carrying 16/32/48/128/256 frames. Earlier
    // versions listed a per-size PNG for each, but that only ever existed
    // to chase a resize theory that turned out to be wrong.
    //
    // The mark inside the tile is drawn at 80% rather than a more typical
    // ~65%, and that crop is load-bearing: Safari draws a contrast outline
    // around any tab-bar favicon it reads as too dark, and it judges the
    // icon as a whole, not its border. Measured at 32px, the same tile
    // rang at mean luminance 95.8 (mark at 70%) and came back clean at
    // 104.7 (mark at 80%), while the edge barely moved either way
    // (69.3 -> 69.9). Adding padding back drops the mean toward the
    // ringing side of a roughly 9-point margin, so don't shrink the mark
    // without brightening the tile to compensate.
    //
    // If the ring ever returns, public/icon-mark.ico is the proven escape
    // hatch: the bare mark on transparency, no tile, mean 168 / edge 255.
    //
    // icon.svg stays off this list — it's the dark-green rounded mark at
    // the old small scale, right for the JSON-LD logo above, but Safari
    // picking it as a favicon would put the ring straight back.
    icon: [{ url: "/brand-icon.ico", sizes: "any" }],
    shortcut: "/brand-icon.ico",
    // Without an apple-touch-icon, Safari's Start Page tiles and the iOS
    // Home Screen fall back to centring the small favicon on a plate of
    // their own — which is the "transparent box" around the icon, and why
    // it read smaller than every neighbouring tile.
    //
    // These are deliberately full-bleed, opaque and NOT rounded: iOS
    // applies its own squircle mask, so baking in corners (or leaving
    // transparency for it to fill) is what produces a boxed-in look.
    // Green rather than the tab bar's white, because Safari's contrast
    // outline only applies to the dark tab strip — on a tile these read
    // like the bold single-colour icons they sit next to.
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/apple-touch-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
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
