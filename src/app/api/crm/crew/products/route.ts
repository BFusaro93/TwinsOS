import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";

/**
 * GET /api/crm/crew/products?q=... — the product picker crew-app's "Request
 * Materials" screen searches (crew-app/src/app/(app)/visit/request-
 * materials.tsx). Restricted to categories a landscaping/snow field crew
 * would plausibly request — stocked_material and project_material — never
 * maintenance_part (that's the CMMS side; see CLAUDE.md's ProductItem
 * category note). product_items reads are not blocked for crew role by RLS
 * (only the procurement write-side is), so this could also be a direct
 * Supabase query from the RN client, but it goes through a route here for
 * consistency with every other list this app fetches (visits, photos) and
 * to keep the category/org scoping server-side and in one place.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("product_items")
    .select("id, name, part_number, unit_cost, category")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .in("category", ["stocked_material", "project_material"])
    .order("name", { ascending: true })
    .limit(50);

  if (q) {
    query = query.or(`name.ilike.%${q}%,part_number.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    (data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name,
      partNumber: row.part_number,
      unitCostCents: row.unit_cost,
      category: row.category,
    }))
  );
}
