import { NextResponse } from "next/server";
import type { ChatMessage, Corpus } from "@/lib/types";

// Stub for the Phase 0 walking skeleton — echoes a canned, citation-shaped
// reply. Replaced by the real grounded, corpus-citing Anthropic call in
// Phase 4.
export async function POST(request: Request) {
  const { messages, corpus } = (await request.json()) as {
    messages?: ChatMessage[];
    corpus?: Corpus;
  };

  if (!messages || messages.length === 0) {
    return NextResponse.json({ error: "No message provided." }, { status: 400 });
  }

  const firstPaper = corpus?.papers?.[0];
  const reply = firstPaper
    ? `That's a fair question, and I'd normally dig into the corpus for it — but I'm still running on placeholder data today. Once the real pipeline is wired up, I'll answer this grounded in the actual papers, citing sources like [${firstPaper.title}](${firstPaper.link}).`
    : "I don't have a corpus to work from yet.";

  return NextResponse.json({ reply } satisfies { reply: string });
}
