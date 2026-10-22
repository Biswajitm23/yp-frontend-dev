import { NextRequest, NextResponse } from "next/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { requireAuth } from "@/lib/requireAuth";
import { getServerOpenAI, isAllowedModel } from "@/lib/openaiServer";

// Server-side proxy for a single (non-streaming) chat completion. Used by the
// CV pre-fill flow. The OpenAI API key stays server-side; the browser only ever
// talks to this same-origin, auth-gated route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The CV "file" fallback embeds a base64 PDF, so allow a generous body; anything
// larger than this is almost certainly abuse.
const MAX_BYTES = 15_000_000;

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: {
    model?: unknown;
    messages?: unknown;
    temperature?: unknown;
    response_format?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isAllowedModel(body.model)) {
    return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  try {
    const client = getServerOpenAI();
    const completion = await client.chat.completions.create({
      model: body.model,
      messages: body.messages as ChatCompletionMessageParam[],
      ...(typeof body.temperature === "number"
        ? { temperature: body.temperature }
        : {}),
      ...(body.response_format
        ? { response_format: body.response_format as never }
        : {}),
    });
    const content = completion.choices[0]?.message?.content ?? "";
    return NextResponse.json({ content });
  } catch (err) {
    console.error(
      "[api/ai/chat] OpenAI request failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
