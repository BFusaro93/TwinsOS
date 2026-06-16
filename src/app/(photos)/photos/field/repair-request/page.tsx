import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { PortalForm } from "@/app/request/[slug]/PortalForm";
import type { WOCategoryConfig, AssetTypeConfig } from "@/stores/settings-store";

export default async function FieldRepairRequestPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const orgId = user.user_metadata?.org_id as string | undefined;
  if (!orgId) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("name, slug, brand_color, portal_enabled, customizations")
    .eq("id", orgId)
    .single();

  if (!org) redirect("/login");

  const customizations = (org.customizations ?? {}) as Record<string, unknown>;

  const assetTypes: string[] = (
    (customizations.assetTypes as AssetTypeConfig[] | undefined) ?? []
  )
    .filter((t) => t.enabled)
    .map((t) => t.label);

  const woCategories: string[] = (
    (customizations.woCategories as WOCategoryConfig[] | undefined) ?? []
  )
    .filter((c) => c.enabled)
    .map((c) => c.label);

  return (
    <PortalForm
      orgSlug={org.slug}
      orgName={org.name}
      brandColor={org.brand_color ?? "#60ab45"}
      portalEnabled={true}
      assetTypes={assetTypes}
      woCategories={woCategories}
    />
  );
}
