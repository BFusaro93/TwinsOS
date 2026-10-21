import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { searchDocPassages, searchDataDictionary } from "@/lib/docs-search";
import { getMyTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DAILY_LIMIT_PER_ORG = 100;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Follow-ups like "and what if they're not linked?" carry no searchable
 * nouns of their own, so the retrieval query also folds in the previous
 * user questions from this conversation.
 */
function retrievalQuery(question: string, history: ChatTurn[]): string {
  const earlier = history
    .filter((t) => t.role === "user")
    .slice(-2)
    .map((t) => t.content.slice(0, 500));
  return [...earlier, question].join(" ");
}

function formatDocsContext(query: string): string {
  const results = searchDocPassages(query, { limit: 8, maxChars: 9000, perDoc: 3 });
  if (results.length === 0) return "(no matching help articles or guides found)";
  return results
    .map((r) => `### [${r.type}] ${r.title} (${r.path})\n${r.excerpt}`)
    .join("\n\n");
}

function formatDataDictionaryContext(query: string): string {
  const results = searchDataDictionary(query, 5);
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

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "question must be 2000 characters or fewer" }, { status: 400 });
  }
  // History is client-supplied: keep only well-formed turns and cap their size
  // so a crafted payload can't run up token cost or inject odd roles.
  const history: ChatTurn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is ChatTurn =>
      !!t && typeof t === "object" &&
      (t.role === "user" || t.role === "assistant") &&
      typeof t.content === "string" && t.content.trim().length > 0)
    .slice(-10)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));

  // Cap Ask AI at 100 requests/org/day so no single tenant can run up the
  // shared ANTHROPIC_API_KEY bill. Atomic RPC avoids a check-then-write race.
  const today = todayInZone(await getMyTimeZone(supabase));
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

  const query = retrievalQuery(question, history);

  const systemPrompt = `You are the in-app help assistant for Landscapt (field service / CRM for landscaping and snow) and Equipt (CMMS and purchasing). Your goal is to fully answer the user's question yourself so they don't need to email support. Build your answer from the two context sections below — help-guide passages, and data-model entries (what is actually tracked in the database).

How to answer:
- Lead with the direct answer in one or two sentences, then give detail. For "how do I…" questions give numbered steps with the exact menu path (e.g. "Settings → Users → Create Crew Account"), and say which role or permission is needed when the context mentions one.
- Hypotheticals and "what happens if…" questions: reason from the documented behavior to the consequence, and walk through it. When your answer is an inference rather than something the context states outright, say so briefly ("The guide doesn't describe that exact case, but since …").
- Questions that span features or products (Settings vs. Landscapt, Equipt vs. Landscapt, who can see what): explain how the pieces connect and what the user has to do on each side. Say plainly when two things are NOT linked automatically.
- Cite the source in plain words: "per the [Guide Name] guide", or "per the data model" for data-dictionary content. If a question asks whether something is "tracked" or "stored" and the data model answers it, prefer that — guides can go stale.
- Answer only what the context supports. Never invent menu paths, buttons, settings, limits or behaviors. If the context covers part of the question, answer that part and name exactly what it doesn't cover.
- If the question is ambiguous, ask ONE short clarifying question (which module, which role, which step they're stuck on) instead of guessing or sending them away.
- Only when the context truly doesn't cover it, or it needs something only the support team can do (billing changes, restoring or fixing data, a suspected bug, account-specific access), say so and suggest the Support feedback widget. Tell them what details to include (page, what they clicked, what they expected). Offer the closest related guide first if one exists.
- Be concise and plain-spoken, no jargon. Don't repeat the question back.

Matching help guide passages:
${formatDocsContext(query)}

Matching data model entries:
${formatDataDictionaryContext(query)}`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: "user" as const, content: question },
  ];

  const encoder = new TextEncoder();
  const anthropicStream = anthropic.messages.stream({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
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
