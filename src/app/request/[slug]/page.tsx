/**
 * Public maintenance-request portal — accessible without login.
 * URL: /request/[orgSlug]
 *
 * The slug in the URL identifies the org. Org data (name, branding,
 * categories) is fetched server-side with the service-role key so RLS
 * is not a barrier for unauthenticated visitors.
 */

import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { PortalForm } from "./PortalForm";
import type { WOCategoryConfig, AssetTypeConfig } from "@/stores/settings-store";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function RequestPortalSlugPage({ params }: PageProps) {
  const { slug } = await params;

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, brand_color, portal_enabled, customizations")
    .eq("slug", slug)
    .single();

  if (!org) notFound();

  const customizations = (org.customizations ?? {}) as Record<string, unknown>;

  // Pull asset types and WO categories from saved settings, fall back to
  // sensible defaults so the form always has something to show.
  const assetTypes: string[] = ((customizations.assetTypes as AssetTypeConfig[] | undefined) ?? [])
    .filter((t) => t.enabled)
    .map((t) => t.label);

  const woCategories: string[] = ((customizations.woCategories as WOCategoryConfig[] | undefined) ?? [])
    .filter((c) => c.enabled)
    .map((c) => c.label);

  const [{ data: assets }, { data: vehicles }] = await Promise.all([
    supabase.from("assets").select("id, name").eq("org_id", org.id).eq("status", "active").is("deleted_at", null),
    supabase.from("vehicles").select("id, name").eq("org_id", org.id).eq("status", "active").is("deleted_at", null),
  ]);
  const equipmentOptions = [...(assets ?? []), ...(vehicles ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PortalForm
      orgSlug={slug}
      orgName={org.name}
      brandColor={org.brand_color ?? "#60ab45"}
      portalEnabled={org.portal_enabled ?? false}
      assetTypes={assetTypes}
      woCategories={woCategories}
      equipmentOptions={equipmentOptions}
    />
  );
}
