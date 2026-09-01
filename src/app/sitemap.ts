import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

const FEATURE_SUBPAGES = [
  "equipt/api-integrations",
  "equipt/asset-registry",
  "equipt/automations",
  "equipt/preventive-maintenance",
  "equipt/purchasing-inventory",
  "equipt/reporting",
  "equipt/vendors",
  "equipt/work-orders",
  "landscapt/api-integrations",
  "landscapt/automations",
  "landscapt/client-portal",
  "landscapt/crew-app",
  "landscapt/estimating",
  "landscapt/invoicing",
  "landscapt/job-photos",
  "landscapt/projects",
  "landscapt/reporting",
  "landscapt/scheduling",
  "landscapt/snow",
  "landscapt/tickets",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const topLevel: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/features`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/features/equipt`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/features/landscapt`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/integrations`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const featurePages: MetadataRoute.Sitemap = FEATURE_SUBPAGES.map((slug) => ({
    url: `${SITE_URL}/features/${slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // /legal/privacy-policy and /legal/sms-terms are intentionally excluded —
  // they're the Twilio-registered SMS consent pages for Twins Lawn Service,
  // not general Landscapt pages, and shouldn't be promoted for search
  // indexing (they stay live and linked directly from the SMS opt-in forms).
  const legalPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/dpa`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  return [...topLevel, ...featurePages, ...legalPages];
}
