import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
  // pdfjs-dist ships ESM-only (.mjs). Transpile it so Next.js/webpack can
  // bundle it for the client without "module parse failed" errors on Vercel.
  transpilePackages: ["pdfjs-dist"],
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
