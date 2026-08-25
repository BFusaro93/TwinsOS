import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

function page(title: string, message: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:60px 20px"><tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:36px 40px">
      <tr><td>
        <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a">${title}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569">${message}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const campaignId = new URL(req.url).searchParams.get("campaign");

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (admin as any)
    .from("clients")
    .select("id, org_id, do_not_market")
    .eq("unsubscribe_token", token)
    .is("deleted_at", null)
    .single();

  if (!client) {
    return new NextResponse(
      page("Link not valid", "This unsubscribe link is invalid or has expired."),
      { status: 404, headers: { "Content-Type": "text/html" } }
    );
  }

  if (!client.do_not_market) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from("clients")
      .update({ do_not_market: true, updated_at: new Date().toISOString() })
      .eq("id", client.id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("client_activity").insert({
      org_id: client.org_id,
      client_id: client.id,
      activity_type: "note",
      subject: "Unsubscribed from marketing emails",
      body: campaignId ? `Unsubscribed via campaign ${campaignId}` : "Unsubscribed via email footer link",
      occurred_at: new Date().toISOString(),
    });

    if (campaignId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // campaignId is caller-supplied via the query string — scope to this
      // client's own org so it can't be used to increment another org's
      // campaign counter.
      const { data: campaign } = await (admin as any)
        .from("crm_campaigns")
        .select("unsubscribed_count")
        .eq("id", campaignId)
        .eq("org_id", client.org_id)
        .single();
      if (campaign) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (admin as any)
          .from("crm_campaigns")
          .update({ unsubscribed_count: (campaign.unsubscribed_count ?? 0) + 1 })
          .eq("id", campaignId);
      }
    }
  }

  return new NextResponse(
    page("You're unsubscribed", "You won't receive any more marketing emails from us. If this was a mistake, contact us directly and we'll update your preferences."),
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
