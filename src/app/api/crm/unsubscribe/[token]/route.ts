import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// Public endpoint linked from marketing emails.
//   GET  -> confirmation page only. NEVER mutates: mail scanners and link
//           prefetchers open GET links without the recipient's consent.
//   POST -> performs the unsubscribe (form button, or RFC 8058 one-click
//           `List-Unsubscribe=One-Click` from the mail client).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(title: string, message: string, formHtml = "") {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:60px 20px"><tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:36px 40px">
      <tr><td>
        <h1 style="margin:0 0 12px;font-size:19px;color:#0f172a">${esc(title)}</h1>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569">${esc(message)}</p>
        ${formHtml}
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}

function html(body: string, status = 200) {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

function invalidPage() {
  return html(page("Link not valid", "This unsubscribe link is invalid or has expired."), 404);
}

function getAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseCampaign(req: Request): string | null {
  const c = new URL(req.url).searchParams.get("campaign");
  return c && UUID_RE.test(c) ? c : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!UUID_RE.test(token)) return invalidPage();

  const admin = getAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: client } = await (admin as any)
    .from("clients")
    .select("first_name, org_id, do_not_market")
    .eq("unsubscribe_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) return invalidPage();

  if (client.do_not_market) {
    return html(page("You're unsubscribed", "You won't receive any more marketing emails from us."));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (admin as any)
    .from("organizations")
    .select("name")
    .eq("id", client.org_id)
    .maybeSingle();
  const orgName: string = org?.name ?? "us";
  const first: string | null = client.first_name ?? null;

  const campaignId = parseCampaign(req);
  const action = `/api/crm/unsubscribe/${encodeURIComponent(token)}${campaignId ? `?campaign=${campaignId}` : ""}`;
  const form = `<form method="POST" action="${esc(action)}" style="margin:20px 0 0">
          <button type="submit" style="background:#0f172a;color:#fff;border:0;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer">Unsubscribe</button>
        </form>`;
  return html(
    page(
      "Unsubscribe from marketing emails",
      `${first ? `Hi ${first}, c` : "C"}onfirm below to stop receiving marketing emails from ${orgName}.`,
      form
    )
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!UUID_RE.test(token)) return invalidPage();

  // RFC 8058 one-click bodies (`List-Unsubscribe=One-Click`) and the confirm
  // form both land here; the token in the URL is the only input that matters.
  const admin = getAdmin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: result, error } = await (admin as any).rpc("crm_unsubscribe_client", {
    p_token: token,
    p_campaign_id: parseCampaign(req),
  });

  if (error) {
    return html(page("Something went wrong", "We couldn't process your request. Please try again later."), 500);
  }
  if (result === "not_found") return invalidPage();

  return html(
    page(
      "You're unsubscribed",
      "You won't receive any more marketing emails from us. If this was a mistake, contact us directly and we'll update your preferences."
    )
  );
}
