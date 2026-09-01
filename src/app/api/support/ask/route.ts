import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchDocs, searchDataDictionary } from "@/lib/docs-search";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAILY_LIMIT_PER_ORG = 100;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function formatDocsContext(question: string): string {
  const results = searchDocs(question, 5);
  if (results.length === 0) return "(no matching help articles or guides found)";
  return results
    .map((r) => `- [${r.type}] ${r.title} (${r.path}): ${r.excerpt}`)
    .join("\n");
}

function formatDataDictionaryContext(question: string): string {
  const results = searchDataDictionary(question, 5);
  if (results.length === 0) return "(no matching data model entries found)";
  return results
    .map((r) => {
      const notes = r.notes.length > 0 ? `\n  Notes: ${r.notes.join(" ")}` : "";
      const columns = r.columns.length > 0 ? `\n  Tracked fields: ${r.columns.join(", ")}` : "";
      return `- ${r.name}: ${r.description}${notes}${columns}`;
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
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

  let body: { question?: string; history?: ChatTurn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

  // Cap Ask AI at 100 requests/org/day so no single tenant can run up the
  // shared ANTHROPIC_API_KEY bill. Atomic RPC avoids a check-then-write race.
  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: withinLimit, error: usageError } = await (supabase as any).rpc(
    "try_increment_ai_chat_usage",
    { p_org_id: orgId, p_day: today, p_limit: DAILY_LIMIT_PER_ORG }
  );

  if (usageError) {
    return NextResponse.json({ error: "Failed to check Ask AI usage" }, { status: 500 });
  }

  if (!withinLimit) {
    return NextResponse.json(
      { error: `Daily Ask AI limit reached (${DAILY_LIMIT_PER_ORG} per organization). Try again tomorrow.` },
      { status: 429 }
    );
  }

  const systemPrompt = `You are the help assistant for a landscaping/CMMS business platform's Support Center. Answer the user's question using ONLY the two context sections below — matching help guide excerpts and matching data-model entries (what is actually tracked in the database).

Rules:
- Attribute every claim to its source: say "per the [Guide Name] guide" for guide content, or "per the data model" for data dictionary content.
- If a question asks whether something is "tracked" or "stored" and the data dictionary context answers it, prefer that over guide prose — guides can go stale, the data model is the ground truth.
- If neither context section answers the question, say plainly that it isn't covered in the docs and suggest using the feedback widget or contacting support. Do not guess or invent behavior.
- Be concise and direct. Use plain language, not jargon.

Matching help guides/articles:
${formatDocsContext(question)}

Matching data model entries:
${formatDataDictionaryContext(question)}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: question },
  ];

  const encoder = new TextEncoder();
  const anthropicStream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      anthropicStream.on("text", (text) => {
        controller.enqueue(encoder.encode(text));
      });
      anthropicStream.on("error", (err) => {
        controller.error(err);
      });
      anthropicStream
        .finalMessage()
        .then(() => controller.close())
        .catch((err) => controller.error(err));
    },
    cancel() {
      anthropicStream.abort();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
