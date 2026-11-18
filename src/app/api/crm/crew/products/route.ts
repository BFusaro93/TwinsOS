import { NextResponse } from "next/server";
import { getRouteAuth } from "@/lib/supabase/route-auth";
import { adminClient } from "@/lib/api/auth";

/**
 * GET /api/crm/crew/products?q=... — the product picker crew-app's "Request
 * Materials" screen searches (crew-app/src/app/(app)/visit/request-
 * materials.tsx). Restricted to categories a landscaping/snow field crew
 * would plausibly request — stocked_material and project_material — never
 * maintenance_part (that's the CMMS side; see CLAUDE.md's ProductItem
 * category note). A crew login can't read product_items itself (the rows
 * carry unit cost, price and stock — 20270109000210), so the search runs with
 * the service role, scoped to the caller's org from their own profile, and
 * returns only id / name / part number / category.
 */
export async function GET(request: Request) {
  const { supabase, user } = await getRouteAuth(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  // Commas, parens and wildcards are PostgREST filter syntax inside .or(...);
  // left in, a search like "a,b" (or a crafted one) breaks/reshapes the filter.
  const q = (searchParams.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .maybeSingle();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return NextResponse.json({ error: "No organization for this user" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (adminClient() as any)
    .from("product_items")
    .select("id, name, part_number, category")
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
      // No unit cost: this list goes to a shared field tablet, which never
      // shows a price (the request is priced by the office). Returning it
      // leaked every stocked/project material's cost to any crew login.
      category: row.category,
    }))
  );
}
