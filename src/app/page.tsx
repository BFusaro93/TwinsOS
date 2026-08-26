import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";

export const metadata: Metadata = {
  title: "Landscapt & Equipt | The all-in-one OS for landscape & snow companies",
  description:
    "Landscapt runs estimating, dispatch, billing, and client relationships. Equipt runs asset maintenance and purchasing. One platform, one login.",
};

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <LandingPage />;
}
