import type { Metadata } from "next";

export const SITE_URL = "https://landscapt.com";
export const SITE_NAME = "Landscapt & Equipt";
export const DEFAULT_OG_IMAGE = "/screenshots/dispatch-board.png";

/**
 * Builds a page's Metadata with canonical URL + Open Graph/Twitter card
 * defaults layered in, so every marketing page only has to supply the
 * title/description/path it actually differs on.
 */
export function buildMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}
