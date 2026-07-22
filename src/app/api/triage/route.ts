import { NextResponse } from "next/server";
import { generateTriage } from "@/lib/anthropic";
import type { ChatMessage } from "@/lib/types";

// First chat stage: given the question (and conversation), Dr. Shannon
// decides which 1-3 papers to open in full, from the abstracts alone, and
// writes the in-character reading decision the user sees before the
// answer. A fast, separate call so the reading choice is visible before
// any full-text read happens — the honest "watch him choose" moment.
export async function POST(request: Request) {
  const { messages, corpus } = (await request.json()) as {
    messages?: ChatMessage[];
    corpus?: { title: string; abstract: string }[];
  };

  if (!messages?.length || !corpus?.length) {
    return NextResponse.json(
      { error: "A message and the corpus abstracts are required." },
      { status: 400 },
    );
  }

  try {
    const result = await generateTriage(messages, corpus);
    return NextResponse.json(result);
  } catch (err) {
    console.error("triage route failed:", err);
    return NextResponse.json({ error: "triage_failed" }, { status: 502 });
  }
}
