import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: estimateId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (!profile?.org_id) {
    return NextResponse.json({ error: "Org not found" }, { status: 403 });
  }

  const orgId: string = profile.org_id;

  let body: { prompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Fetch context: top 20 services
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: services } = await (supabase as any)
    .from("crm_services")
    .select("id, name, default_rate_cents, unit_type:unit, calc_type:service_mode")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .limit(20);

  // Fetch context: top 30 recent won estimate line items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: recentItems } = await (supabase as any)
    .from("estimate_line_items")
    .select("service_name, qty, rate_cents, unit_type, visits, estimates!inner(stage, org_id)")
    .eq("estimates.org_id", orgId)
    .eq("estimates.stage", "won")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const servicesContext = (services ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) =>
      `- ${s.name} (id: ${s.id}, rate: $${((s.default_rate_cents ?? 0) / 100).toFixed(2)}, unit: ${s.unit_type ?? "each"})`
    )
    .join("\n");

  const recentContext = (recentItems ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((li: any) =>
      `- ${li.service_name}: qty=${li.qty}, rate=$${((li.rate_cents ?? 0) / 100).toFixed(2)}, unit=${li.unit_type ?? "each"}, visits=${li.visits}`
    )
    .join("\n");

  const systemPrompt = `You are a landscaping estimating assistant. Given a description of work needed, suggest estimate line items based on the company's services and past estimates. Return ONLY valid JSON — an array of line item suggestions with no additional text, markdown, or explanation.`;

  const userPrompt = `Company services:
${servicesContext || "(none)"}

Recent won estimate line items:
${recentContext || "(none)"}

Customer request: ${prompt}

Based on the above, suggest up to 10 estimate line items. For each item, if the suggested service name closely matches one of the company services listed above, include its id in serviceId, otherwise set serviceId to null.

Return ONLY a JSON array in this exact shape:
[
  {
    "serviceName": "string",
    "serviceId": "uuid or null",
    "qty": number,
    "rateCents": number,
    "unitType": "string",
    "visits": number,
    "estimateDesc": "string"
  }
]`;

  let suggestions: unknown[];
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const content = message.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from AI");
    }

    // Strip markdown code fences if present
    const raw = content.text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("AI response is not an array");
    }

    suggestions = parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(suggestions);
}
