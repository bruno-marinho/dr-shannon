import { NextResponse } from "next/server";
import { generateReadingNotes } from "@/lib/anthropic";
import { fetchFullText } from "@/lib/fulltext";
import type { Paper, ReadingNote } from "@/lib/types";

// One invocation reads ONE paper — the client fires these in parallel
// (bounded concurrency), which keeps each function fast and makes the
// reading stage visible paper-by-paper in the UI. Measured ~18s/paper;
// 120s gives headroom for large PDFs without approaching the plan limit.
export const maxDuration = 120;

export async function POST(request: Request) {
  const { paper } = (await request.json()) as { paper?: Paper };

  if (!paper?.arxivId || !paper.abstract) {
    return NextResponse.json({ error: "A paper is required." }, { status: 400 });
  }

  try {
    // Full text when we can get it (HTML, then PDF); the abstract is the
    // last resort, and the reading prompt makes Dr. Shannon disclose that
    // in his note rather than hide it.
    const fullText = await fetchFullText(paper.arxivId);
    const source = fullText?.source ?? "abstract";
    const text = fullText?.text ?? paper.abstract;

    const notes = await generateReadingNotes(paper, source, text);

    const note: ReadingNote = { arxivId: paper.arxivId, source, notes };
    return NextResponse.json(note);
  } catch (err) {
    // A JSON 502 rather than a bodiless 500. The client degrades a failed
    // read to an abstract-only note so one bad paper never sinks the
    // reading stage.
    console.error(`read route failed for ${paper.arxivId}:`, err);
    return NextResponse.json({ error: "read_failed" }, { status: 502 });
  }
}
