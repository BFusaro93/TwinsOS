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
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
