import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";
import { buildMetadata, SITE_URL } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Landscapt & Equipt | The all-in-one OS for landscape & snow companies",
  description:
    "Landscapt runs estimating, dispatch, billing, and client relationships. Equipt runs asset maintenance and purchasing. One platform, one login.",
  path: "/",
});

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Landscapt & Equipt",
  url: SITE_URL,
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />
      <LandingPage />
    </>
  );
}
