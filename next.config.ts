import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
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
      // Bare /equipt has no page of its own — send it to the home.
      { source: "/equipt", destination: "/equipt/home", permanent: true },
    ];
  },
};

export default nextConfig;
