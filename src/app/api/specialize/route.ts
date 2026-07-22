import { NextResponse } from "next/server";
import { generateSpecialization } from "@/lib/anthropic";

// The "skim" stage: synthesize Dr. Shannon's first-impressions blurb from
// the corpus ABSTRACTS (no paper is read in full here — that happens on
// demand at question time). A separate serverless call so the UI can show
// this stage happening, per the transparency requirement.
export async function POST(request: Request) {
  const { researchQuestion, corpus } = (await request.json()) as {
    researchQuestion?: string;
    corpus?: { title: string; abstract: string }[];
  };

  if (!researchQuestion || !corpus || corpus.length === 0) {
    return NextResponse.json(
      { error: "A research question and non-empty abstracts are required." },
      { status: 400 },
    );
  }

  try {
    const specialization = await generateSpecialization(researchQuestion, corpus);
    return NextResponse.json({ specialization });
  } catch (err) {
    // JSON 502 → client shows a retryable, stage-scoped error. The reading
    // notes already exist client-side, so this step re-runs on its own.
    console.error("specialize route failed:", err);
    return NextResponse.json({ error: "specialize_failed" }, { status: 502 });
  }
}
