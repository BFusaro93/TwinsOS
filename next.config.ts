import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Next's dev-only Segment Explorer wraps every layout/page in an extra
    // client component (SegmentViewNode). On a reload that races a fresh dev
    // compile, the client hydrated those wrappers with one fewer tree fork
    // than the server rendered, so every useId() below the (crm) layout came
    // out different — Radix trigger ids in TopBar ("radix-_R_asr5r6lb_" vs
    // "radix-_R_1bjd5r6lb_") and the "attributes didn't match" hydration
    // error. It never renders in production builds; turning it off only
    // drops the devtools Route Info panel.
    devtoolSegmentExplorer: false,
  },
  images: {
    remotePatterns: [],
  },
  // pdfjs-dist ships ESM-only (.mjs). Transpile it so Next.js/webpack can
  // bundle it for the client without "module parse failed" errors on Vercel.
  transpilePackages: ["pdfjs-dist"],
  // @react-pdf/renderer bundles native font-layout deps (fontkit, yoga
  // WASM) that can break when webpack bundles them into a serverless
  // function (seen on Vercel prod builds) — keep it external so Node
  // resolves it at runtime instead.
  serverExternalPackages: ["@react-pdf/renderer"],
  // twins-os.vercel.app serves the whole marketing site at 200, so every
  // landscapt.com page has an indexable twin on the Vercel host. The canonical
  // tags already point at landscapt.com, but a canonical is a hint — tell
  // crawlers outright not to index anything served under *.vercel.app. The
  // host regex also covers per-branch preview URLs. landscapt.com is
  // unaffected: it never matches this `has` condition.
  async headers() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  async redirects() {
    return [
      // Equipt's home moved off /dashboard, which read as a sibling of the
      // Report Center's /dashboards and of Landscapt's /crm/home. Keep the
      // old paths working — they are in bookmarks, and links to /dashboard
      // sit in already-sent emails.
      { source: "/dashboard", destination: "/equipt/home", permanent: true },
      // Damage Cases is a Landscapt tool, so its Equipt-shell copy is gone;
      // /tools/damage-cases is the canonical one the Tools sidebar links to.
      { source: "/dashboard/damage-cases", destination: "/tools/damage-cases", permanent: true },
      { source: "/dashboards/damage-cases", destination: "/tools/damage-cases", permanent: true },
      // Bare /equipt has no page of its own — send it to the home.
      { source: "/equipt", destination: "/equipt/home", permanent: true },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only upload source maps / annotate builds when an auth token is present
  // (CI/Vercel) — leave both env vars unset for a normal local `next build`.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    // Vercel Cron/monitors integration — off unless you wire up cron jobs.
    automaticVercelMonitors: false,
  },
});
