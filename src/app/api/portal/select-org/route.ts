import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPortalOrgChoices, PORTAL_ACTIVE_ORG_COOKIE } from "@/lib/portal/get-portal-context";

/** POST /api/portal/select-org — sets which org's portal a signed-in user
 * with more than one client_portal_users row wants to view. Called from
 * /portal/select-org after they pick one. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const orgId = typeof body?.orgId === "string" ? body.orgId : null;
  if (!orgId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Never trust the client-supplied orgId on its own — only allow selecting
  // an org the authenticated user actually has a portal account for.
  const choices = await getPortalOrgChoices();
  if (!choices.some((c) => c.org_id === orgId)) {
    return NextResponse.json({ error: "Not authorized for this company" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set(PORTAL_ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return NextResponse.json({ success: true });
}
