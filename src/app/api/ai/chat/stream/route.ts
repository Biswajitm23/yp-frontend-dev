import { NextRequest, NextResponse } from "next/server";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { requireAuth } from "@/lib/requireAuth";
import { getServerOpenAI, isAllowedModel } from "@/lib/openaiServer";

// Server-side streaming proxy for chat completions. Used by summary generation:
// the browser posts the prompt, this route calls OpenAI with the server-only key
// and pipes the token deltas straight back as a plain-text stream. The client
// applies its own word-safe buffering (safeStreamPrefix) on top.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 1_000_000; // generation prompts are text-only.

export async function POST(req: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: { model?: unknown; messages?: unknown };
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

  // Open the OpenAI stream up-front so pre-stream errors (auth/model/etc.)
  // surface as a clean 502 the client can fall back from.
  let openaiStream: Awaited<
    ReturnType<
      ReturnType<typeof getServerOpenAI>["chat"]["completions"]["create"]
    >
  >;
  try {
    openaiStream = await getServerOpenAI().chat.completions.create({
      model: body.model,
      messages: body.messages as ChatCompletionMessageParam[],
      stream: true,
    });
  } catch (err) {
    console.error(
      "[api/ai/chat/stream] OpenAI request failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // `openaiStream` is the async-iterable streaming response.
        for await (const chunk of openaiStream as AsyncIterable<{
          choices?: { delta?: { content?: string } }[];
        }>) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) controller.enqueue(encoder.encode(delta));
        }
      } catch (err) {
        console.error("[api/ai/chat/stream] stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Disable proxy buffering so tokens flush to the client as they arrive.
      "X-Accel-Buffering": "no",
    },
  });
}
