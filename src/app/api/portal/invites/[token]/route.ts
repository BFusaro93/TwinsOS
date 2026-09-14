import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { PortalInviteRow } from "@/lib/portal/portal-db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .rpc("get_portal_invite_by_token", { p_token: token }) as { data: PortalInviteRow[] | null; error: unknown };
  const data = rows?.[0] ?? null;

  if (error || !data) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  if (data.accepted_at) {
    return NextResponse.json({ error: "Invite already accepted" }, { status: 410 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invite has expired" }, { status: 410 });
  }

  return NextResponse.json({
    email: data.email,
    clientId: data.client_id,
    orgId: data.org_id,
  });
}
