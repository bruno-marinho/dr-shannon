import { NextResponse } from "next/server";
import { streamChat } from "@/lib/anthropic";
import type { ChatMessage } from "@/lib/types";

// Dr. Shannon in conversation, grounded only in this session's reading
// notes (see prompts.ts CHAT_SYSTEM_PROMPT). Streams the reply token by
// token as plain text so the UI can render it as it arrives.
export async function POST(request: Request) {
  const { messages, researchQuestion, corpus } = (await request.json()) as {
    messages?: ChatMessage[];
    researchQuestion?: string;
    corpus?: { title: string; link: string; notes: string }[];
  };

  if (!messages?.length || !researchQuestion || !corpus?.length) {
    return NextResponse.json(
      { error: "A message and a read corpus are required." },
      { status: 400 },
    );
  }

  try {
    const anthropicStream = streamChat(messages, researchQuestion, corpus);
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          anthropicStream.on("text", (delta) => {
            controller.enqueue(encoder.encode(delta));
          });
          await anthropicStream.finalMessage();
          controller.close();
        } catch (err) {
          // The stream started but failed mid-flight; close so the client
          // gets what streamed and its finally block runs.
          console.error("chat stream failed mid-flight:", err);
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    console.error("chat route failed:", err);
    return NextResponse.json({ error: "chat_failed" }, { status: 502 });
  }
}
