import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/crm",
        "/po",
        "/cmms",
        "/vendors",
        "/settings",
        "/tools",
        "/dashboards",
        "/photos",
        "/docs",
        "/operations",
        "/support",
        "/portal",
        "/internal",
        "/oauth",
        "/forms/",
        "/request/",
        "/invoice/",
        "/proposal/",
        "/confirm",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
